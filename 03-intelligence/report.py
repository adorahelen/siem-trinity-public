"""
report.py — 일간/주간 보안 보고서 자동 생성
"""

import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

import loki_client

load_dotenv()

REPORTS_PATH = os.getenv("REPORTS_PATH", "/app/reports")


# ─────────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────────

def save_report(content: str, filename: str) -> str:
    os.makedirs(REPORTS_PATH, exist_ok=True)
    path = os.path.join(REPORTS_PATH, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


def _now_kst() -> datetime:
    kst = timezone(timedelta(hours=9))
    return datetime.now(kst)


def _top_ips_from_logs(logs: list[dict], ip_field: str = "src_ip", limit: int = 10) -> list[tuple]:
    """로그 엔트리 목록에서 labels 기준 IP 집계."""
    counts: dict[str, int] = {}
    for entry in logs:
        ip = entry.get("labels", {}).get(ip_field)
        if ip:
            counts[ip] = counts.get(ip, 0) + 1
    return sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]


def _extract_ssh_ips(logs: list[dict], limit: int = 10) -> list[tuple]:
    """SSH 로그에서 IP 파싱 (labels에 src_ip 없을 경우 line 파싱)."""
    import re
    counts: dict[str, int] = {}
    pattern = re.compile(r"Invalid user \S+ from ([\d.]+)")
    for entry in logs:
        ip = entry.get("labels", {}).get("src_ip")
        if not ip:
            m = pattern.search(entry.get("line", ""))
            if m:
                ip = m.group(1)
        if ip:
            counts[ip] = counts.get(ip, 0) + 1
    return sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]


# ─────────────────────────────────────────────
# 일간 보고서
# ─────────────────────────────────────────────

def generate_daily_report(date: str = "today") -> str:
    now = _now_kst()
    if date == "today":
        target = now
    else:
        target = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone(timedelta(hours=9)))

    date_str = target.strftime("%Y-%m-%d")
    hours = 24

    lines = []
    lines.append(f"# SIEM 일간 보안 보고서 — {date_str}")
    lines.append(f"\n> 생성 시각: {now.strftime('%Y-%m-%d %H:%M:%S')} KST\n")
    lines.append("---\n")

    # ── SSH 공격
    lines.append("## 1. SSH 공격 현황")
    try:
        ssh_logs = loki_client.get_ssh_attacks(hours=hours)
        top_ips  = _extract_ssh_ips(ssh_logs, limit=10)
        lines.append(f"\n- 총 공격 시도: **{len(ssh_logs)}건**\n")
        if top_ips:
            lines.append("### 상위 공격 IP TOP 10\n")
            lines.append("| 순위 | IP | 시도 횟수 |")
            lines.append("|------|-----|---------|")
            for i, (ip, cnt) in enumerate(top_ips, 1):
                lines.append(f"| {i} | {ip} | {cnt} |")
        else:
            lines.append("- 데이터 없음")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── fail2ban
    lines.append("\n## 2. fail2ban 자동 차단")
    try:
        bans = loki_client.get_fail2ban_bans(hours=hours)
        lines.append(f"\n- 차단 이벤트: **{len(bans)}건**")
        ban_ips = _top_ips_from_logs(bans, limit=10)
        if ban_ips:
            lines.append("\n### 차단된 IP TOP 10\n")
            lines.append("| 순위 | IP | 차단 횟수 |")
            lines.append("|------|-----|---------|")
            for i, (ip, cnt) in enumerate(ban_ips, 1):
                lines.append(f"| {i} | {ip} | {cnt} |")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── KR-BLOCK
    lines.append("\n## 3. 방화벽 차단 (KR-BLOCK)")
    try:
        blocks = loki_client.get_kr_blocks(hours=hours)
        lines.append(f"\n- 방화벽 차단: **{len(blocks)}건**")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── Suricata
    lines.append("\n## 4. Suricata IDS 알림")
    try:
        all_alerts      = loki_client.get_suricata_alerts(hours=hours)
        critical_alerts = loki_client.get_suricata_alerts(hours=hours, severity=1)
        high_alerts     = loki_client.get_suricata_alerts(hours=hours, severity=2)
        medium_alerts   = loki_client.get_suricata_alerts(hours=hours, severity=3)
        lines.append(f"\n- 전체 알림: **{len(all_alerts)}건**")
        lines.append(f"  - Critical (1): {len(critical_alerts)}건")
        lines.append(f"  - High (2):     {len(high_alerts)}건")
        lines.append(f"  - Medium (3):   {len(medium_alerts)}건")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── Wazuh
    lines.append("\n## 5. Wazuh 보안 알림")
    try:
        wazuh = loki_client.get_wazuh_alerts(hours=hours, min_level=7)
        lines.append(f"\n- High 이상 알림: **{len(wazuh)}건**")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── ModSecurity WAF
    lines.append("\n## 6. ModSecurity WAF")
    try:
        waf = loki_client.query_range('{job="modsec"}', f"now-{hours}h", limit=2000)
        lines.append(f"\n- WAF 이벤트: **{len(waf)}건**")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── Zeek Notice / Weird
    lines.append("\n## 7. Zeek 탐지 이벤트")
    try:
        notice = loki_client.query_range('{job="zeek_notice"}', f"now-{hours}h", limit=2000)
        weird  = loki_client.query_range('{job="zeek_weird"}',  f"now-{hours}h", limit=2000)
        lines.append(f"\n- Notice (보안 탐지): **{len(notice)}건**")
        lines.append(f"- Weird (프로토콜 위반): **{len(weird)}건**")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    lines.append("\n---")
    lines.append(f"\n*보고서 자동 생성: SIEM Intelligence Layer v2.0*")

    content  = "\n".join(lines)
    filename = f"{date_str}_daily.md"
    path     = save_report(content, filename)
    return path


# ─────────────────────────────────────────────
# 주간 보고서
# ─────────────────────────────────────────────

def generate_weekly_report(week_offset: int = 0) -> str:
    now = _now_kst()
    target_week = now - timedelta(weeks=week_offset)
    year, week_num, _ = target_week.isocalendar()
    hours = 24 * 7

    lines = []
    lines.append(f"# SIEM 주간 보안 보고서 — {year}-W{week_num:02d}")
    lines.append(f"\n> 생성 시각: {now.strftime('%Y-%m-%d %H:%M:%S')} KST")
    lines.append(f"> 분석 기간: 최근 7일\n")
    lines.append("---\n")

    # ── SSH 공격
    lines.append("## 1. SSH 공격 현황 (7일)")
    try:
        ssh_logs = loki_client.get_ssh_attacks(hours=hours)
        top_ips  = _extract_ssh_ips(ssh_logs, limit=10)
        lines.append(f"\n- 총 공격 시도: **{len(ssh_logs)}건**\n")
        if top_ips:
            lines.append("### 상위 공격 IP TOP 10\n")
            lines.append("| 순위 | IP | 시도 횟수 |")
            lines.append("|------|-----|---------|")
            for i, (ip, cnt) in enumerate(top_ips, 1):
                lines.append(f"| {i} | {ip} | {cnt} |")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── fail2ban
    lines.append("\n## 2. fail2ban 차단 (7일)")
    try:
        bans = loki_client.get_fail2ban_bans(hours=hours)
        lines.append(f"\n- 차단 이벤트: **{len(bans)}건**")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── KR-BLOCK
    lines.append("\n## 3. 방화벽 차단 (7일)")
    try:
        blocks = loki_client.get_kr_blocks(hours=hours)
        lines.append(f"\n- 방화벽 차단: **{len(blocks)}건**")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── Suricata
    lines.append("\n## 4. Suricata IDS 알림 (7일)")
    try:
        all_alerts = loki_client.get_suricata_alerts(hours=hours)
        critical   = loki_client.get_suricata_alerts(hours=hours, severity=1)
        high       = loki_client.get_suricata_alerts(hours=hours, severity=2)
        medium     = loki_client.get_suricata_alerts(hours=hours, severity=3)
        lines.append(f"\n- 전체: **{len(all_alerts)}건**  (Critical: {len(critical)} / High: {len(high)} / Medium: {len(medium)})")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── Wazuh
    lines.append("\n## 5. Wazuh 보안 알림 (7일)")
    try:
        wazuh = loki_client.get_wazuh_alerts(hours=hours, min_level=7)
        lines.append(f"\n- High 이상 알림: **{len(wazuh)}건**")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    # ── Zeek
    lines.append("\n## 6. Zeek 탐지 이벤트 (7일)")
    try:
        notice = loki_client.query_range('{job="zeek_notice"}', f"now-{hours}h", limit=5000)
        weird  = loki_client.query_range('{job="zeek_weird"}',  f"now-{hours}h", limit=5000)
        lines.append(f"\n- Notice: **{len(notice)}건**  /  Weird: **{len(weird)}건**")
    except Exception as e:
        lines.append(f"\n- 조회 실패: {e}")

    lines.append("\n---")
    lines.append(f"\n*보고서 자동 생성: SIEM Intelligence Layer v2.0*")

    content  = "\n".join(lines)
    filename = f"{year}-W{week_num:02d}_weekly.md"
    path     = save_report(content, filename)
    return path


# ─────────────────────────────────────────────
# 직접 실행 시 일간 보고서 생성
# ─────────────────────────────────────────────

if __name__ == "__main__":
    from rich.console import Console

    console = Console()
    console.print("\n[bold cyan]일간 보안 보고서 생성 중...[/bold cyan]")

    with console.status("[bold green]Loki 데이터 수집 중..."):
        path = generate_daily_report()

    console.print(f"\n[bold green]✓ 보고서 저장 완료:[/bold green] {path}")
