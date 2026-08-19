"""
Loki HTTP API 공통 클라이언트.
모든 탐지기가 import해서 사용. 에러 시 예외 발생 금지 — 빈 리스트 반환.
"""
import time
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Optional

from config import LOKI_URL


def _now_ns() -> str:
    """현재 시각을 nanosecond 타임스탬프 문자열로 반환."""
    return str(int(time.time() * 1e9))


def _hours_ago_ns(hours: float) -> str:
    return str(int((time.time() - hours * 3600) * 1e9))


def _parse_streams(response_json: dict) -> list[dict]:
    """
    Loki streams 응답 파싱.
    반환: [{"timestamp": "...", "labels": {...}, "line": "..."}, ...]
    """
    results = []
    data = response_json.get("data", {})
    result_list = data.get("result", [])
    for stream in result_list:
        labels = stream.get("stream", {})
        for ts, line in stream.get("values", []):
            results.append({"timestamp": ts, "labels": labels, "line": line})
    return results


def query_range(logql: str, start_ns: Optional[str] = None, end_ns: Optional[str] = None,
                hours: float = 1.0, limit: int = 5000) -> list[dict]:
    """
    Loki range 쿼리. 로그 라인 리스트 반환.
    에러 시 빈 리스트 반환 (예외 발생 금지).
    """
    if start_ns is None:
        start_ns = _hours_ago_ns(hours)
    if end_ns is None:
        end_ns = _now_ns()
    try:
        resp = requests.get(
            f"{LOKI_URL}/loki/api/v1/query_range",
            params={"query": logql, "start": start_ns, "end": end_ns,
                    "limit": limit, "direction": "forward"},
            timeout=30,
        )
        resp.raise_for_status()
        return _parse_streams(resp.json())
    except Exception:
        return []


def query_instant(logql: str) -> list[dict]:
    """Loki instant 쿼리 (집계값 조회용)."""
    try:
        resp = requests.get(
            f"{LOKI_URL}/loki/api/v1/query",
            params={"query": logql, "time": _now_ns()},
            timeout=30,
        )
        resp.raise_for_status()
        return _parse_streams(resp.json())
    except Exception:
        return []


# ────────────────────────────────────────────
# 소스별 전용 함수
# ────────────────────────────────────────────

def get_zeek_conn(hours: float = 1) -> list[dict]:
    """{job="zeek_conn"} | json | __error__="" """
    return query_range('{job="zeek_conn"} | json | __error__=""', hours=hours)


def get_zeek_dns(hours: float = 1) -> list[dict]:
    """{job="zeek_dns"} | json | __error__="" """
    return query_range('{job="zeek_dns"} | json | __error__=""', hours=hours)


def get_ssh_attacks(hours: float = 24) -> list[dict]:
    """{job="auth"} |= "Invalid user" """
    return query_range('{job="auth"} |= "Invalid user"', hours=hours)


def get_fail2ban_bans(hours: float = 24) -> list[dict]:
    """{job="fail2ban"} | json | f2b_action="Ban" """
    return query_range('{job="fail2ban"} | json | f2b_action="Ban"', hours=hours)


def get_suricata_alerts(hours: float = 24) -> list[dict]:
    """{job="suricata"} | json | event_type="alert" """
    return query_range('{job="suricata"} | json | event_type="alert"', hours=hours)


def get_wazuh_alerts(hours: float = 24) -> list[dict]:
    """{job="wazuh"} | json | level=~"([7-9]|1[0-5])" """
    return query_range('{job="wazuh"} | json | level=~"([7-9]|1[0-5])"', hours=hours)


def get_kr_blocks(hours: float = 24) -> list[dict]:
    """{job="kern"} | json | kern_event="[KR-BLOCK]" """
    return query_range('{job="kern"} | json | kern_event="[KR-BLOCK]"', hours=hours)


def get_modsec(hours: float = 24) -> list[dict]:
    """{job="modsec"} | json """
    return query_range('{job="modsec"} | json | __error__=""', hours=hours)


def get_nginx(hours: float = 24) -> list[dict]:
    """{job="nginx_access_enriched"} | json """
    return query_range('{job="nginx_access_enriched"} | json | __error__=""', hours=hours)


def parse_json_line(line: str) -> dict:
    """로그 라인(문자열)을 JSON으로 파싱. 실패 시 빈 dict 반환."""
    try:
        return json.loads(line)
    except Exception:
        return {}


# ────────────────────────────────────────────
# 단독 실행 시 연결 테스트
# ────────────────────────────────────────────

if __name__ == "__main__":
    from rich.console import Console
    from rich.table import Table

    console = Console()
    console.print(f"\n[bold]Loki 연결 테스트[/bold] → {LOKI_URL}\n")

    sources = [
        ("zeek_conn", get_zeek_conn),
        ("zeek_dns", get_zeek_dns),
        ("auth (SSH)", get_ssh_attacks),
        ("fail2ban", get_fail2ban_bans),
        ("suricata", get_suricata_alerts),
        ("wazuh", get_wazuh_alerts),
        ("kern (KR-BLOCK)", get_kr_blocks),
        ("modsec", get_modsec),
        ("nginx", get_nginx),
    ]

    table = Table(title="최근 1시간 로그 건수")
    table.add_column("소스", style="cyan")
    table.add_column("건수", justify="right", style="green")

    for name, fn in sources:
        hours = 1 if name in ("zeek_conn", "zeek_dns") else 24
        logs = fn(hours=hours)
        table.add_row(name, str(len(logs)))

    console.print(table)
