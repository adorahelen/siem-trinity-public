"""
loki_client.py — Loki HTTP API 쿼리 모듈
"""

import os
import time
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

LOKI_URL = os.getenv("LOKI_URL", "http://127.0.0.1:3100")


# ─────────────────────────────────────────────
# 내부 유틸
# ─────────────────────────────────────────────

def _to_ns(value: str) -> str:
    """ISO8601 또는 'now-Xh' 형식을 나노초 Unix 타임스탬프 문자열로 변환."""
    if value == "now":
        return str(int(time.time() * 1e9))

    if value.startswith("now-"):
        suffix = value[4:]
        if suffix.endswith("h"):
            delta = timedelta(hours=int(suffix[:-1]))
        elif suffix.endswith("d"):
            delta = timedelta(days=int(suffix[:-1]))
        elif suffix.endswith("m"):
            delta = timedelta(minutes=int(suffix[:-1]))
        else:
            raise ValueError(f"지원하지 않는 시간 형식: {value}")
        ts = datetime.now(timezone.utc) - delta
        return str(int(ts.timestamp() * 1e9))

    # ISO8601
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return str(int(dt.timestamp() * 1e9))


def _parse_response(resp: requests.Response) -> list[dict]:
    """Loki 응답에서 로그 엔트리 리스트 추출."""
    resp.raise_for_status()
    data = resp.json()

    result = data.get("data", {}).get("result", [])
    entries = []
    for stream in result:
        labels = stream.get("stream", {})
        for ts_ns, line in stream.get("values", []):
            entries.append({
                "timestamp": datetime.fromtimestamp(int(ts_ns) / 1e9, tz=timezone.utc).isoformat(),
                "labels": labels,
                "line": line,
            })

    entries.sort(key=lambda x: x["timestamp"])
    return entries


# ─────────────────────────────────────────────
# 기본 쿼리 함수
# ─────────────────────────────────────────────

def query_range(logql: str, start: str, end: str = "now", limit: int = 1000) -> list[dict]:
    """
    Loki range 쿼리.
    start/end: ISO8601 또는 'now-24h' 형식
    반환: 로그 라인 리스트 (timestamp, labels, line)
    """
    params = {
        "query": logql,
        "start": _to_ns(start),
        "end": _to_ns(end),
        "limit": limit,
        "direction": "forward",
    }
    resp = requests.get(f"{LOKI_URL}/loki/api/v1/query_range", params=params, timeout=30)
    return _parse_response(resp)


def query_instant(logql: str, time_str: str = "now") -> list[dict]:
    """
    Loki instant 쿼리 (집계값 등).
    """
    params = {
        "query": logql,
        "time": _to_ns(time_str),
    }
    resp = requests.get(f"{LOKI_URL}/loki/api/v1/query", params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    result = data.get("data", {}).get("result", [])
    entries = []
    for item in result:
        metric = item.get("metric", {})
        value = item.get("value", [None, None])
        entries.append({
            "metric": metric,
            "timestamp": datetime.fromtimestamp(float(value[0]), tz=timezone.utc).isoformat() if value[0] else None,
            "value": value[1],
        })
    return entries


# ─────────────────────────────────────────────
# 보안 이벤트별 쿼리 함수
# ─────────────────────────────────────────────

def get_ssh_attacks(hours: int = 24) -> list[dict]:
    """SSH Invalid user 이벤트 조회."""
    return query_range(
        logql='{job="auth"} |= "Invalid user"',
        start=f"now-{hours}h",
        limit=5000,
    )


def get_fail2ban_bans(hours: int = 24) -> list[dict]:
    """fail2ban Ban 이벤트 조회."""
    return query_range(
        logql='{job="fail2ban", f2b_action="Ban"}',
        start=f"now-{hours}h",
        limit=2000,
    )


def get_suricata_alerts(hours: int = 24, severity: int = None) -> list[dict]:
    """
    Suricata alert 이벤트 조회.
    severity: 1=Critical, 2=High, 3=Medium (None이면 전체)
    """
    if severity is not None:
        logql = f'{{job="suricata"}} | json | event_type="alert" | alert_severity="{severity}"'
    else:
        logql = '{job="suricata"} | json | event_type="alert"'
    return query_range(logql=logql, start=f"now-{hours}h", limit=5000)


def get_wazuh_alerts(hours: int = 24, min_level: int = 7) -> list[dict]:
    """Wazuh High 알림 조회."""
    if min_level <= 9:
        pattern = f"([{min_level}-9]|1[0-5])"
    else:
        lvl = min_level
        pattern = f"1[{str(lvl)[1]}-5]"
    logql = '{job="wazuh", level=~"' + pattern + '"}'
    return query_range(logql=logql, start=f"now-{hours}h", limit=3000)


def get_kr_blocks(hours: int = 24) -> list[dict]:
    """KR-BLOCK 방화벽 차단 이벤트 조회."""
    return query_range(
        logql='{job="kern", kern_event="[KR-BLOCK]"}',
        start=f"now-{hours}h",
        limit=3000,
    )


def get_zeek_dns(hours: int = 24, rcode: str = None) -> list[dict]:
    """
    Zeek DNS 이벤트 조회.
    rcode: 'NXDOMAIN', 'NOERROR' 등 (None이면 전체)
    """
    if rcode:
        logql = f'{{job="zeek_dns"}} | json | rcode_name="{rcode}"'
    else:
        logql = '{job="zeek_dns"} | json'
    return query_range(logql=logql, start=f"now-{hours}h", limit=3000)


def get_zeek_notice(hours: int = 24) -> list[dict]:
    """Zeek 보안 탐지 이벤트 (notice) 조회."""
    return query_range(
        logql='{job="zeek_notice"} | json',
        start=f"now-{hours}h",
        limit=3000,
    )


def get_zeek_http(hours: int = 24, status_code: int = None) -> list[dict]:
    """
    Zeek HTTP 요청 이벤트 조회.
    status_code: 200, 404, 500 등 (None이면 전체)
    """
    if status_code is not None:
        logql = f'{{job="zeek_http"}} | json | status_code="{status_code}"'
    else:
        logql = '{job="zeek_http"} | json'
    return query_range(logql=logql, start=f"now-{hours}h", limit=3000)


def get_zeek_ssl(hours: int = 24) -> list[dict]:
    """Zeek TLS/SSL 이벤트 조회 (버전, 암호화 스위트)."""
    return query_range(
        logql='{job="zeek_ssl"} | json',
        start=f"now-{hours}h",
        limit=3000,
    )


def get_zeek_weird(hours: int = 24) -> list[dict]:
    """Zeek 프로토콜 위반(weird) 이벤트 조회."""
    return query_range(
        logql='{job="zeek_weird"} | json',
        start=f"now-{hours}h",
        limit=2000,
    )


def get_modsec_alerts(hours: int = 24) -> list[dict]:
    """ModSecurity WAF 탐지 이벤트 조회."""
    return query_range(
        logql='{job="modsec"}',
        start=f"now-{hours}h",
        limit=3000,
    )


def get_nginx_geo(hours: int = 24) -> list[dict]:
    """GeoIP 기반 접근 현황 조회 (국가, 도시, 좌표)."""
    return query_range(
        logql='{job="nginx_visitors_geo"}',
        start=f"now-{hours}h",
        limit=3000,
    )


def get_open_ports() -> list[dict]:
    """현재 열린 포트 현황 조회."""
    return query_range(
        logql='{job="ss_ports"}',
        start="now-1h",
        limit=500,
    )


def get_top_attack_ips(hours: int = 24, limit: int = 20) -> list[dict]:
    """공격 IP 상위 목록 (SSH + Suricata 통합)."""
    # SSH 공격 IP 집계
    ssh_logql = (
        f'topk({limit}, sum by (src_ip) '
        f'(count_over_time({{job="auth"}} |= "Invalid user" [{hours}h])))'
    )
    ssh_results = query_instant(ssh_logql)

    ip_counts: dict[str, int] = {}
    for item in ssh_results:
        ip = item.get("metric", {}).get("src_ip", "unknown")
        try:
            count = int(item.get("value", 0))
        except (ValueError, TypeError):
            count = 0
        ip_counts[ip] = ip_counts.get(ip, 0) + count

    # Suricata alert IP 집계
    suricata_logql = (
        f'topk({limit}, sum by (src_ip) '
        f'(count_over_time({{job="suricata"}} | json | event_type="alert" [{hours}h])))'
    )
    suricata_results = query_instant(suricata_logql)
    for item in suricata_results:
        ip = item.get("metric", {}).get("src_ip", "unknown")
        try:
            count = int(item.get("value", 0))
        except (ValueError, TypeError):
            count = 0
        ip_counts[ip] = ip_counts.get(ip, 0) + count

    sorted_ips = sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    return [{"ip": ip, "count": count} for ip, count in sorted_ips]


# ─────────────────────────────────────────────
# 직접 실행 시 연결 테스트
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Loki URL: {LOKI_URL}")

    # 연결 확인
    try:
        resp = requests.get(f"{LOKI_URL}/ready", timeout=5)
        print(f"Loki 상태: {resp.text.strip()}")
    except Exception as e:
        print(f"Loki 연결 실패: {e}")
        exit(1)

    print("\n[SSH 공격]")
    attacks = get_ssh_attacks(hours=24)
    print(f"  SSH 공격 시도: {len(attacks)}건")

    print("\n[fail2ban 차단]")
    bans = get_fail2ban_bans(hours=24)
    print(f"  차단 이벤트: {len(bans)}건")

    print("\n[Suricata 알림]")
    alerts = get_suricata_alerts(hours=24)
    print(f"  전체 알림: {len(alerts)}건")
    critical = get_suricata_alerts(hours=24, severity=1)
    print(f"  Critical: {len(critical)}건")

    print("\n[Wazuh 알림]")
    wazuh = get_wazuh_alerts(hours=24)
    print(f"  High 이상 알림: {len(wazuh)}건")

    print("\n[KR-BLOCK]")
    blocks = get_kr_blocks(hours=24)
    print(f"  방화벽 차단: {len(blocks)}건")

    print("\n[상위 공격 IP]")
    top_ips = get_top_attack_ips(hours=24, limit=10)
    for i, item in enumerate(top_ips, 1):
        print(f"  {i:2}. {item['ip']:20s}  {item['count']}건")
