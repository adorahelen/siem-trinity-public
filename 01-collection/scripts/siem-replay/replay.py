"""
SIEM-Trinity 실시간 데이터 리플레이어 — Loki HTTP push 로 5개 보안 스트림 합성.

배경:
- 빈 VM(232) 에는 실제 fail2ban·Suricata·Zeek·Wazuh 가 없어서 Loki 가 비어있음
- → Grafana 패널 빈 화면 → XDR 6단계 동작 시각화 불가
- 본 스크립트가 합성 보안 이벤트를 Promtail 의 job label 과 일치시켜 직접 Loki 에 push

생성 스트림 (Promtail config 기준):
  auth        — SSH Invalid user (브루트포스 시뮬)
  fail2ban    — f2b_action=Ban (자동 차단 이벤트)
  suricata    — eve.json (severity 1~3 IDS 알림)
  wazuh       — level 7~15 HIDS 알림
  kern        — KR-BLOCK 방화벽 차단 (외국 IP 스캔)
  modsec      — WAF rule_id 매칭 (HTTP 공격)
  zeek_conn   — 정상/이상 connection (포트스캔 등)

시나리오 (주기적으로 자동 주입):
- SSH brute-force burst (15분 마다 3분)
- Suricata Critical spike (30분 마다 1분)
- 외국 IP 스캔 폭증 (45분 마다 5분)

ATT&CK 매핑이 메시지에 포함되어 02-detection 의 attack_map 과 정합.

env:
  LOKI_URL              http://192.168.10.232:3100  (기본 http://loki:3100)
  REPLAY_BASE_TPS       1.0  초당 이벤트 수
  REPLAY_ANOMALY_INT    900  이상 시나리오 간격(초)
"""
from __future__ import annotations

import gzip
import json
import os
import random
import signal
import sys
import time
import urllib.request
from datetime import datetime, timezone

LOKI_URL = os.getenv("LOKI_URL", "http://loki:3100").rstrip("/")
BASE_TPS = float(os.getenv("REPLAY_BASE_TPS", "1.0"))
ANOMALY_INTERVAL = int(os.getenv("REPLAY_ANOMALY_INT", "900"))
ANOMALY_DURATION = int(os.getenv("REPLAY_ANOMALY_DUR", "180"))


# ── 외부 IP 풀 (악성 후보) + 화이트리스트 ─────────────────────
EXTERNAL_IPS = [
    "203.0.113.42", "203.0.113.99", "198.51.100.7", "198.51.100.231",
    "185.220.101.45", "185.220.101.78", "45.95.169.13", "62.102.148.69",
    "194.165.16.79", "92.118.39.74", "5.181.86.110", "117.50.13.221",
    "180.76.246.131", "121.4.115.224", "47.96.121.150", "118.68.111.42",
    "61.177.172.140", "222.187.232.205", "203.0.113.55",  "112.85.42.176",
]
WHITELIST_IPS = ["127.0.0.1", "192.168.10.232", "192.168.10.42", "10.0.0.1"]

USERS_TRIED = ["root", "admin", "user", "test", "ubuntu", "oracle", "postgres",
               "mysql", "git", "ftp", "www-data", "deploy", "centos", "jenkins"]

NGINX_PATHS = ["/", "/admin", "/wp-login.php", "/.env", "/login", "/api/v1/users",
               "/phpmyadmin/", "/.git/config", "/actuator/health", "/sql",
               "/?action=login", "/cgi-bin/test.cgi"]

SURICATA_SIGS = [
    ("ET SCAN Nmap Scripting Engine User-Agent Detected", 2),
    ("ET POLICY SSH session in progress on Expected Port", 3),
    ("ET MALWARE Mirai Variant CnC Activity", 1),
    ("ET WEB_SPECIFIC_APPS WordPress wp-login.php Brute Force Attempt", 2),
    ("ET EXPLOIT Possible Log4Shell JNDI Lookup", 1),
    ("ET DOS Inbound GoldenEye DoS attack", 1),
    ("ET INFO Suspicious Outbound DNS Query", 3),
    ("ET COINMINER CoinMiner Activity", 2),
]

WAZUH_RULES = [
    (5712, "sshd: Multiple authentication failures.", 10),
    (5763, "sshd: brute force trying to get access to the system.", 10),
    (40111, "Multiple authentication failures followed by a success.", 12),
    (31151, "Multiple web server 400 error codes.", 10),
    (31153, "Multiple web server 404 error codes (web scan).", 10),
    (510, "Host-based anomaly detection event (rootcheck).", 12),
    (550, "Integrity checksum changed.", 7),
    (594, "syscheck: new file detected in /etc/.", 8),
]

MODSEC_RULES = [
    (920100, "Invalid HTTP Request Line"),
    (920170, "GET or HEAD Request with Body Content"),
    (941100, "XSS Attack Detected via libinjection"),
    (942100, "SQL Injection Attack Detected via libinjection"),
    (944100, "Possible Java Code Injection"),
    (913100, "Found User-Agent associated with security scanner"),
]


def now_ns() -> int:
    return time.time_ns()


def pick_ip(weight_anomaly: bool = False) -> str:
    """anomaly 모드면 외부 IP 비중↑, 평소엔 90% 외부 + 10% whitelist."""
    if weight_anomaly:
        return random.choice(EXTERNAL_IPS)
    return random.choice(EXTERNAL_IPS) if random.random() > 0.10 else random.choice(WHITELIST_IPS)


# ── Loki push ──────────────────────────────────────────────
def push_streams(streams: list[dict]) -> None:
    """streams: [{labels: {...}, values: [[ts_ns_str, line], ...]}, ...]"""
    if not streams:
        return
    body = json.dumps({"streams": streams}).encode()
    req = urllib.request.Request(
        f"{LOKI_URL}/loki/api/v1/push",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5).close()
    except Exception as e:
        print(f"  [WARN] Loki push 실패: {e}", flush=True)


# ── 이벤트 생성기 ──────────────────────────────────────────
def gen_auth_line(ts_iso: str, anomaly: bool) -> tuple[dict, str]:
    """SSH Invalid user 형식 (job=auth)."""
    ip = pick_ip(anomaly)
    user = random.choice(USERS_TRIED)
    line = (
        f"{ts_iso} mail sshd[{random.randint(10000, 99999)}]: "
        f"Invalid user {user} from {ip} port {random.randint(40000, 60000)}"
    )
    return {"job": "auth", "host": "mail"}, line


def gen_fail2ban_line(ts_iso: str, anomaly: bool) -> tuple[dict, str]:
    ip = pick_ip(anomaly)
    action = random.choice(["Ban", "Unban"]) if not anomaly else "Ban"
    line = (
        f"{ts_iso} fail2ban.actions[{random.randint(1000, 9999)}]: "
        f"NOTICE [sshd] {action} {ip}"
    )
    return {"job": "fail2ban", "f2b_action": action, "f2b_ip": ip}, line


def gen_suricata_line(ts_iso: str, anomaly: bool) -> tuple[dict, str]:
    sig, sev = random.choice(SURICATA_SIGS)
    if anomaly:
        sev = min(sev, 2)   # anomaly 시 Critical/High 비중↑
    src_ip = pick_ip(anomaly)
    dst_ip = "192.168.10.232"
    eve = {
        "timestamp": ts_iso,
        "event_type": "alert",
        "src_ip": src_ip,
        "src_port": random.randint(40000, 60000),
        "dest_ip": dst_ip,
        "dest_port": random.choice([22, 80, 443, 3306, 6379]),
        "proto": "TCP",
        "alert": {
            "signature": sig,
            "severity": sev,
            "category": "Attempted Information Leak" if sev > 1 else "Web Application Attack",
        },
    }
    labels = {"job": "suricata", "src_ip": src_ip, "alert_severity": str(sev)}
    return labels, json.dumps(eve)


def gen_wazuh_line(ts_iso: str, anomaly: bool) -> tuple[dict, str]:
    rid, desc, level = random.choice(WAZUH_RULES)
    src_ip = pick_ip(anomaly)
    msg = {
        "timestamp": ts_iso,
        "rule": {"id": rid, "level": level, "description": desc},
        "srcip": src_ip,
        "agent": {"name": "siem-host.example.local"},
    }
    return {"job": "wazuh", "level": str(level), "srcip": src_ip}, json.dumps(msg)


def gen_kern_line(ts_iso: str, anomaly: bool) -> tuple[dict, str]:
    src_ip = pick_ip(anomaly)
    dpt = random.choice([22, 23, 3389, 445, 8080, 5900])
    line = (
        f"{ts_iso} mail kernel: [KR-BLOCK] IN=ens18 OUT= "
        f"MAC=01:02:03:04:05:06 SRC={src_ip} DST=192.168.10.232 "
        f"PROTO=TCP SPT={random.randint(40000, 60000)} DPT={dpt}"
    )
    return {"job": "kern", "kern_event": "[KR-BLOCK]", "src_ip": src_ip, "dpt": str(dpt)}, line


def gen_modsec_line(ts_iso: str, anomaly: bool) -> tuple[dict, str]:
    rid, msg = random.choice(MODSEC_RULES)
    src_ip = pick_ip(anomaly)
    line = json.dumps({
        "timestamp": ts_iso,
        "transaction": {
            "client_ip": src_ip,
            "request": {"method": "GET", "uri": random.choice(NGINX_PATHS)},
            "response": {"http_code": random.choice([400, 403, 500])},
        },
        "audit_data": {"messages": [msg]},
        "rule_id": rid,
    })
    return {"job": "modsec", "rule_id": str(rid), "src_ip": src_ip}, line


def gen_zeek_conn_line(ts_iso: str, anomaly: bool) -> tuple[dict, str]:
    src_ip = pick_ip(anomaly)
    dst_ip = "192.168.10.232"
    dst_port = random.choice([22, 80, 443, 3306, 4444, 1337, 31337])
    proto = "tcp"
    state = "S0" if anomaly and random.random() < 0.3 else random.choice(["SF", "S0", "REJ"])
    pkts_orig = 1 if state == "S0" else random.randint(2, 100)
    bytes_orig = pkts_orig * random.randint(64, 1500)
    rec = {
        "ts": ts_iso,
        "id.orig_h": src_ip, "id.orig_p": random.randint(40000, 60000),
        "id.resp_h": dst_ip, "id.resp_p": dst_port,
        "proto": proto, "conn_state": state,
        "orig_bytes": bytes_orig, "resp_bytes": random.randint(0, 1024),
        "orig_pkts": pkts_orig, "resp_pkts": random.randint(0, 10),
        "duration": round(random.uniform(0.001, 5.0), 3),
    }
    labels = {
        "job": "zeek_conn",
        "id_orig_h": src_ip,
        "id_resp_h": dst_ip,
        "id_resp_p": str(dst_port),
        "proto": proto, "conn_state": state,
    }
    return labels, json.dumps(rec)


# ── 시나리오 burst ─────────────────────────────────────────
SCENARIOS = [
    {"name": "ssh-brute-force-burst", "streams": ["auth", "fail2ban"], "burst_rate": 30, "desc": "SSH 브루트포스 (auth+fail2ban 폭증)"},
    {"name": "suricata-critical-spike", "streams": ["suricata"], "burst_rate": 15, "desc": "Suricata Critical/High 알림 폭증"},
    {"name": "foreign-port-scan", "streams": ["kern", "zeek_conn"], "burst_rate": 25, "desc": "외국 IP 포트스캔 (KR-BLOCK + Zeek S0)"},
    {"name": "web-attack-wave", "streams": ["modsec", "suricata"], "burst_rate": 12, "desc": "WAF SQLi/XSS 탐지 + IDS 알림"},
    {"name": "endpoint-attack", "streams": ["wazuh", "auth"], "burst_rate": 18, "desc": "Wazuh HIDS 다중 알림 (rootcheck/integrity)"},
]


GENERATORS = {
    "auth": gen_auth_line,
    "fail2ban": gen_fail2ban_line,
    "suricata": gen_suricata_line,
    "wazuh": gen_wazuh_line,
    "kern": gen_kern_line,
    "modsec": gen_modsec_line,
    "zeek_conn": gen_zeek_conn_line,
}


# ── 메인 루프 ──────────────────────────────────────────────
running = True


def stop(*_):
    global running
    running = False
    print("\n[STOP] 종료 신호 수신", flush=True)


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(f"[INIT] LOKI_URL={LOKI_URL} BASE_TPS={BASE_TPS}", flush=True)
    print(f"[INIT] streams={list(GENERATORS.keys())} scenarios={[s['name'] for s in SCENARIOS]}", flush=True)

    current_anomaly = None
    anomaly_end = 0.0
    last_anomaly_start = time.time() - ANOMALY_INTERVAL  # 시작 직후 첫 시나리오 발화 가능
    total = 0
    last_stats = time.time()

    while running:
        now = time.time()
        ts_iso = datetime.now(timezone.utc).isoformat()

        # 이상 시나리오 manage
        if current_anomaly and now > anomaly_end:
            print(f"  [ANOMALY END] {current_anomaly['name']}", flush=True)
            current_anomaly = None
        if not current_anomaly and (now - last_anomaly_start) > ANOMALY_INTERVAL:
            current_anomaly = random.choice(SCENARIOS)
            anomaly_end = now + ANOMALY_DURATION
            last_anomaly_start = now
            print(f"  [ANOMALY START] {current_anomaly['name']} — {current_anomaly['desc']}", flush=True)

        # 배치 빌드
        streams_acc: dict[tuple, list] = {}

        def add(labels: dict, line: str):
            key = tuple(sorted(labels.items()))
            streams_acc.setdefault(key, []).append([str(now_ns()), line])

        # baseline: 모든 스트림에 작은 트래픽
        for name, gen in GENERATORS.items():
            if random.random() < 0.5:
                labels, line = gen(ts_iso, anomaly=False)
                add(labels, line)

        # burst: 시나리오 활성 시 해당 스트림에 N건
        if current_anomaly:
            burst = max(3, int(current_anomaly["burst_rate"] / max(BASE_TPS, 0.1)))
            for stream in current_anomaly["streams"]:
                gen = GENERATORS[stream]
                for _ in range(burst):
                    labels, line = gen(ts_iso, anomaly=True)
                    add(labels, line)

        # Loki 형식으로 변환
        streams_list = [
            {"stream": dict(k), "values": v} for k, v in streams_acc.items()
        ]
        push_streams(streams_list)
        total += sum(len(v) for v in streams_acc.values())

        # 통계 60초 마다
        if now - last_stats > 60:
            mode = current_anomaly["name"] if current_anomaly else "baseline"
            print(f"[STATS] total={total} mode={mode}", flush=True)
            last_stats = now

        time.sleep(1.0 / max(BASE_TPS, 0.1))


if __name__ == "__main__":
    main()
