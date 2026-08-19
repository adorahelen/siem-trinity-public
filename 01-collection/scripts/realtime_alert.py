#!/usr/bin/env python3
"""
realtime_alert.py — 실시간 보안 critical alert (Loki → Discord)

동작:
  1. Loki에 지난 N분(기본 6분, 5분 cron 오버랩 1분) 쿼리
  2. 임계 위반 발견 시 Discord webhook으로 즉시 푸시
  3. 동일 alert key는 60분 쿨다운 (state 파일 추적)

알림 대상:
  - Wazuh level ≥ 12 (critical)
  - Suricata severity 1 (high)
  - fail2ban Ban (신규 IP만)
  - SSH brute-force (5분 동일 IP 10회 이상 fail)
  - KR-BLOCK burst (5분 100건 이상)
  - ModSec critical rule (940/941/942/943 군 — SQLi/XSS/RFI 등)
  - 신규 0.0.0.0 리스너 감지 (signum-receiver 재발 방지)

cron 등록 예:
  */5 * * * * root /usr/local/bin/run-realtime-alert.sh

환경변수:
  LOKI_URL                            (기본: http://localhost:3100)
  DISCORD_CRITICAL_WEBHOOK_URL        (필수 — 없으면 발송 안함)
  REALTIME_STATE_FILE                 (기본: /var/lib/security-digest/realtime-state)
  COOLDOWN_MIN                        (기본: 60)
  WINDOW_MIN                          (기본: 6 — Loki 조회 범위, cron 5분 + 1분 오버랩)
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta, timezone
from collections import Counter

CONFIG = {
    "loki_url":     os.getenv("LOKI_URL", "http://localhost:3100"),
    "discord_url":  os.getenv("DISCORD_CRITICAL_WEBHOOK_URL", ""),
    "state_file":   os.getenv("REALTIME_STATE_FILE", "/var/lib/security-digest/realtime-state"),
    "cooldown_min": int(os.getenv("COOLDOWN_MIN", "60")),
    "window_min":   int(os.getenv("WINDOW_MIN",   "6")),
}

DISCORD_COLOR = {
    "critical": 15158332,  # red
    "high":     15105570,  # orange
    "warning":  16776960,  # yellow
    "info":     3447003,   # blue
}

USER_AGENT = "kangminlog-realtime-alert/1.0"


def log(msg: str):
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


# ── Loki ────────────────────────────────────────────────────────────────────

def loki_query_range(logql: str, start_ns: int, end_ns: int, limit: int = 1000) -> list:
    params = urllib.parse.urlencode({
        "query": logql, "start": start_ns, "end": end_ns,
        "limit": limit, "direction": "backward",
    })
    url = f"{CONFIG['loki_url']}/loki/api/v1/query_range?{params}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        lines = []
        for stream in data.get("data", {}).get("result", []):
            for _, line in stream.get("values", []):
                lines.append(line)
        return lines
    except Exception as e:
        log(f"[Loki 오류] {logql[:60]}... → {e}")
        return []


# ── 상태 파일 (쿨다운) ───────────────────────────────────────────────────────

def load_state() -> dict:
    path = CONFIG["state_file"]
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state: dict):
    path = CONFIG["state_file"]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, path)


def in_cooldown(state: dict, key: str) -> bool:
    last = state.get(key, 0)
    return (time.time() - last) < CONFIG["cooldown_min"] * 60


def mark_sent(state: dict, key: str):
    state[key] = int(time.time())


# ── Discord 발송 ────────────────────────────────────────────────────────────

def send_discord(title: str, description: str, severity: str, fields: list) -> bool:
    url = CONFIG["discord_url"]
    if not url:
        log("[Discord] webhook URL 미설정 — 발송 건너뜀")
        return False

    icon = {"critical": "🔴", "high": "🟠", "warning": "🟡", "info": "🔵"}[severity]
    embed = {
        "title": f"{icon} {title}",
        "description": description,
        "color": DISCORD_COLOR[severity],
        "fields": fields,
        "footer": {"text": f"realtime-alert · severity={severity}"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    payload = json.dumps({"embeds": [embed]}).encode()
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            log(f"[Discord] {severity.upper()} {title[:40]} — http={resp.status}")
            return True
    except urllib.error.HTTPError as e:
        log(f"[Discord 오류] HTTP {e.code} — {e.read()[:200]}")
        return False
    except Exception as e:
        log(f"[Discord 오류] {e}")
        return False


# ── 검사기 ───────────────────────────────────────────────────────────────────

def check_wazuh_critical(start_ns: int, end_ns: int, state: dict):
    """Wazuh level ≥12 (critical) — rule_id 단위 쿨다운."""
    lines = loki_query_range('{job="wazuh"}', start_ns, end_ns, limit=500)
    by_rule = {}
    for line in lines:
        try:
            obj = json.loads(line)
            lvl = int(obj.get("rule", {}).get("level", 0))
            if lvl >= 12:
                rid = str(obj.get("rule", {}).get("id", "0"))
                by_rule.setdefault(rid, []).append(obj)
        except Exception:
            pass

    for rid, alerts in by_rule.items():
        key = f"wazuh:{rid}"
        if in_cooldown(state, key):
            continue
        sample = alerts[0]
        desc = sample.get("rule", {}).get("description", "(no description)")
        srcip = sample.get("data", {}).get("srcip", "?")
        agent = sample.get("agent", {}).get("name", "?")
        fields = [
            {"name": "Rule", "value": f"{rid} (level {sample.get('rule', {}).get('level')})", "inline": True},
            {"name": "Agent", "value": agent, "inline": True},
            {"name": "Source IP", "value": srcip, "inline": True},
            {"name": "Count (window)", "value": str(len(alerts)), "inline": True},
            {"name": "Description", "value": desc[:300]},
        ]
        if send_discord(f"[Wazuh] critical alert — rule {rid}", desc[:500], "critical", fields):
            mark_sent(state, key)


def check_suricata_high(start_ns: int, end_ns: int, state: dict):
    """Suricata severity=1 — signature_id 단위 쿨다운."""
    lines = loki_query_range('{job="suricata"} |= `"event_type":"alert"`', start_ns, end_ns, limit=500)
    by_sig = {}
    for line in lines:
        try:
            obj = json.loads(line)
            alert = obj.get("alert", {})
            if int(alert.get("severity", 0)) != 1:
                continue
            sid = str(alert.get("signature_id", 0))
            by_sig.setdefault(sid, []).append(obj)
        except Exception:
            pass

    for sid, alerts in by_sig.items():
        key = f"suricata:{sid}"
        if in_cooldown(state, key):
            continue
        sample = alerts[0]
        sig = sample["alert"].get("signature", "?")
        src = f"{sample.get('src_ip', '?')}:{sample.get('src_port', '?')}"
        dst = f"{sample.get('dest_ip', '?')}:{sample.get('dest_port', '?')}"
        fields = [
            {"name": "Signature", "value": f"{sid}", "inline": True},
            {"name": "Source", "value": src, "inline": True},
            {"name": "Destination", "value": dst, "inline": True},
            {"name": "Count (window)", "value": str(len(alerts)), "inline": True},
        ]
        if send_discord(f"[Suricata] high severity — {sig[:50]}", sig, "high", fields):
            mark_sent(state, key)


def check_fail2ban(start_ns: int, end_ns: int, state: dict):
    """fail2ban Ban 발생 — 신규 IP만 알림."""
    lines = loki_query_range('{job="fail2ban"} |= "Ban"', start_ns, end_ns)
    seen = set()
    for line in lines:
        parts = line.split("Ban ")
        if len(parts) > 1:
            ip = parts[1].strip().split()[0]
            seen.add(ip)
    if not seen:
        return

    key = "fail2ban:banlist"
    if in_cooldown(state, key):
        return
    fields = [
        {"name": "Banned IPs", "value": "\n".join(sorted(seen)[:10])},
        {"name": "Count", "value": str(len(seen)), "inline": True},
    ]
    if send_discord(f"[fail2ban] {len(seen)}개 IP 차단", "신규 fail2ban Ban 발생", "warning", fields):
        mark_sent(state, key)


def check_ssh_bruteforce(start_ns: int, end_ns: int, state: dict):
    """5분 동일 IP 10회 이상 SSH 인증 실패."""
    lines = loki_query_range('{job="auth"} |= "Failed password"', start_ns, end_ns, limit=2000)
    ips = Counter()
    for line in lines:
        parts = line.split(" from ")
        if len(parts) > 1:
            ip = parts[1].split()[0]
            ips[ip] += 1

    for ip, n in ips.items():
        if n < 10:
            continue
        key = f"ssh-bf:{ip}"
        if in_cooldown(state, key):
            continue
        fields = [
            {"name": "Source IP", "value": ip, "inline": True},
            {"name": "Failed attempts", "value": str(n), "inline": True},
            {"name": "Window", "value": f"{CONFIG['window_min']}분", "inline": True},
        ]
        if send_discord(f"[SSH] brute-force 의심 — {ip}", f"{ip}에서 {n}회 인증 실패", "high", fields):
            mark_sent(state, key)


def check_kr_block_burst(start_ns: int, end_ns: int, state: dict):
    """5분 100건 이상 KR-BLOCK = 외국 IP 스캔/DDoS 의심."""
    lines = loki_query_range('{job="kern", kern_event="[KR-BLOCK]"}', start_ns, end_ns, limit=2000)
    if len(lines) < 100:
        return
    key = "kr-block:burst"
    if in_cooldown(state, key):
        return
    fields = [
        {"name": "Drop count", "value": str(len(lines)), "inline": True},
        {"name": "Window", "value": f"{CONFIG['window_min']}분", "inline": True},
    ]
    if send_discord(f"[KR-BLOCK] 외국 IP 스캔 의심 — {len(lines)}건", "1분 100건 이상 차단 — DDoS/스캐너 가능성", "warning", fields):
        mark_sent(state, key)


def check_modsec_critical(start_ns: int, end_ns: int, state: dict):
    """ModSecurity critical rule (940/941/942/943) — SQLi/XSS/RFI 등."""
    lines = loki_query_range('{job="modsec"}', start_ns, end_ns, limit=500)
    critical_rules = ("942", "941", "940", "943")  # SQLi, XSS, generic, RFI
    by_rule = {}
    for line in lines:
        if '[id "' not in line:
            continue
        rid = line.split('[id "')[1].split('"')[0]
        if rid[:3] in critical_rules:
            by_rule.setdefault(rid, []).append(line)

    for rid, hits in by_rule.items():
        key = f"modsec:{rid}"
        if in_cooldown(state, key):
            continue
        fields = [
            {"name": "Rule ID", "value": rid, "inline": True},
            {"name": "Count", "value": str(len(hits)), "inline": True},
            {"name": "Category", "value": {
                "942": "SQL Injection", "941": "XSS", "940": "Generic", "943": "RFI/LFI",
            }.get(rid[:3], "?"), "inline": True},
        ]
        if send_discord(f"[ModSec] critical rule {rid} — {len(hits)}건", hits[0][:500], "critical", fields):
            mark_sent(state, key)


def check_new_listeners(state: dict):
    """0.0.0.0/* 리스너 신규 감지 — signum-receiver 재발 방지.
    state 파일에 known set 저장, 새로 등장하면 알림."""
    import subprocess
    try:
        result = subprocess.run(
            ["ss", "-tlnH"], capture_output=True, text=True, timeout=5,
        )
        listeners = set()
        for raw_line in result.stdout.splitlines():
            parts = raw_line.split()
            if len(parts) < 4:
                continue
            local = parts[3]  # ex: 0.0.0.0:8080 or [::]:8080 or 127.0.0.1:53
            host, _, port = local.rpartition(":")
            if host in ("0.0.0.0", "*", "[::]"):
                listeners.add(port)
    except Exception as e:
        log(f"[ss 오류] {e}")
        return

    known = set(state.get("_known_listeners", []))
    new = listeners - known
    if not new:
        return

    if known:
        key = f"new-listener:{','.join(sorted(new))}"
        if not in_cooldown(state, key):
            fields = [
                {"name": "신규 포트", "value": ", ".join(sorted(new))},
                {"name": "전체 0.0.0.0 리스너", "value": ", ".join(sorted(listeners))[:1000]},
            ]
            if send_discord(
                f"[Listener] 신규 0.0.0.0 바인딩 — {len(new)}개",
                "새로운 외부 노출 포트 감지 — 의도한 변경인지 확인 필요",
                "high", fields,
            ):
                mark_sent(state, key)

    state["_known_listeners"] = sorted(listeners)


# ── 메인 ────────────────────────────────────────────────────────────────────

def main():
    if not CONFIG["discord_url"]:
        log("DISCORD_CRITICAL_WEBHOOK_URL 미설정 — 종료")
        sys.exit(1)

    now      = datetime.now(timezone.utc)
    start    = now - timedelta(minutes=CONFIG["window_min"])
    start_ns = int(start.timestamp() * 1e9)
    end_ns   = int(now.timestamp() * 1e9)

    log(f"start window={CONFIG['window_min']}m cooldown={CONFIG['cooldown_min']}m")
    state = load_state()

    check_wazuh_critical(start_ns, end_ns, state)
    check_suricata_high(start_ns, end_ns, state)
    check_fail2ban(start_ns, end_ns, state)
    check_ssh_bruteforce(start_ns, end_ns, state)
    check_kr_block_burst(start_ns, end_ns, state)
    check_modsec_critical(start_ns, end_ns, state)
    check_new_listeners(state)

    save_state(state)
    log("end")


if __name__ == "__main__":
    main()
