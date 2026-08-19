"""
IP 위험도 스코어러 (IP Risk Scorer)
하나의 IP에 대한 모든 보안 신호를 통합해 0~100 위험도 점수 산출.

실행: bash run.sh ip_risk_scorer.py [--hours 24] [--ip 1.2.3.4]
"""
import argparse
import re
from collections import defaultdict

from rich.console import Console
from rich.table import Table
from rich import box

from config import IP_RISK_HIGH_THRESHOLD, IP_RISK_CRITICAL_THRESHOLD, MISP_IOC_WEIGHT, is_internal_ip
from misp_client import lookup_ip as misp_lookup_ip
from loki_client import (
    get_zeek_conn, get_ssh_attacks, get_fail2ban_bans,
    get_suricata_alerts, get_wazuh_alerts, get_kr_blocks, get_modsec,
    parse_json_line,
)
from alert_manager import send_alert
from attack_map import resolve_technique
from auto_ban import auto_ban
from shuffle_client import trigger as shuffle_trigger
from thehive_client import create_case as thehive_create_case
from config import THEHIVE_AUTO_CASE_VERDICTS

console = Console()

# ────────────────────────────────────────────
# 가중치 정의 (CLAUDE.md 기준)
# ────────────────────────────────────────────
WEIGHTS = {
    "ssh_attempts": 20,       # SSH 공격 시도 (100회 이상 = 만점)
    "fail2ban_ban": 20,       # fail2ban 차단 이력 있으면 만점
    "suricata_critical": 15,  # Suricata Critical(severity=1) 1건 = 만점
    "suricata_high": 10,      # Suricata High(severity=2)
    "wazuh_high": 10,         # Wazuh High(level>=7)
    "kr_block": 10,           # KR-BLOCK 방화벽 차단
    "waf_modsec": 5,          # WAF(ModSecurity) 탐지
    "beacon": 5,              # 비콘 탐지 연계
    "dga": 5,                 # DGA 연관 (외부 입력)
    "misp_ioc": MISP_IOC_WEIGHT,  # MISP IOC 매칭 (외부 위협 인텔리전스, 단계 4)
}


def _extract_ip_from_ssh(line: str) -> str:
    """SSH Invalid user 로그에서 IP 추출."""
    m = re.search(r'from (\d+\.\d+\.\d+\.\d+)', line)
    return m.group(1) if m else ""


def _extract_ip_from_fail2ban(line: str, labels: dict) -> str:
    """fail2ban 로그에서 차단된 IP 추출."""
    ip = labels.get("f2b_ip", "")
    if ip:
        return ip
    m = re.search(r'Ban (\d+\.\d+\.\d+\.\d+)', line)
    return m.group(1) if m else ""


def collect_all_signals(hours: float = 24) -> dict[str, dict]:
    """
    모든 Loki 소스에서 IP별 신호 수집.
    반환: {ip: {"ssh_attempts": N, "is_banned": bool, ...}}
    """
    signals: dict[str, dict] = defaultdict(lambda: {
        "ssh_attempts": 0,
        "is_banned": False,
        "suricata_critical": 0,
        "suricata_high": 0,
        "wazuh_alerts": 0,
        "kr_blocks": 0,
        "waf_hits": 0,
    })

    # SSH 공격
    for entry in get_ssh_attacks(hours=hours):
        line = entry.get("line", "")
        ip = _extract_ip_from_ssh(line)
        if ip and not is_internal_ip(ip):
            signals[ip]["ssh_attempts"] += 1

    # fail2ban 차단
    for entry in get_fail2ban_bans(hours=hours):
        labels = entry.get("labels", {})
        line = entry.get("line", "")
        ip = _extract_ip_from_fail2ban(line, labels)
        if ip and not is_internal_ip(ip):
            signals[ip]["is_banned"] = True

    # Suricata 알림
    for entry in get_suricata_alerts(hours=hours):
        labels = entry.get("labels", {})
        line_data = parse_json_line(entry.get("line", ""))

        def _get(*keys):
            for k in keys:
                v = labels.get(k) or line_data.get(k)
                if v and str(v) not in ("-", ""):
                    return str(v)
            return ""

        src_ip = _get("src_ip", "alert_src_ip")
        severity = _get("alert_severity", "severity")
        if src_ip and not is_internal_ip(src_ip):
            try:
                sev = int(severity)
            except (ValueError, TypeError):
                sev = 3
            if sev == 1:
                signals[src_ip]["suricata_critical"] += 1
            elif sev == 2:
                signals[src_ip]["suricata_high"] += 1

    # Wazuh
    for entry in get_wazuh_alerts(hours=hours):
        labels = entry.get("labels", {})
        line_data = parse_json_line(entry.get("line", ""))
        src_ip = labels.get("srcip") or line_data.get("srcip") or \
                 labels.get("src_ip") or line_data.get("src_ip") or \
                 labels.get("agent_ip", "")
        if src_ip and not is_internal_ip(src_ip):
            signals[src_ip]["wazuh_alerts"] += 1

    # KR-BLOCK
    for entry in get_kr_blocks(hours=hours):
        labels = entry.get("labels", {})
        line = entry.get("line", "")
        # kern 로그: SRC= 또는 labels의 src_ip
        ip = labels.get("src_ip", "")
        if not ip:
            m = re.search(r'SRC=(\d+\.\d+\.\d+\.\d+)', line)
            ip = m.group(1) if m else ""
        if ip and not is_internal_ip(ip):
            signals[ip]["kr_blocks"] += 1

    # ModSecurity WAF
    for entry in get_modsec(hours=hours):
        labels = entry.get("labels", {})
        line_data = parse_json_line(entry.get("line", ""))
        ip = labels.get("src_ip") or line_data.get("src_ip") or \
             labels.get("client_ip") or line_data.get("client_ip") or ""
        if ip and not is_internal_ip(ip):
            signals[ip]["waf_hits"] += 1

    return dict(signals)


def get_ip_signals(ip: str, hours: float = 24) -> dict:
    """단일 IP 신호 수집 (전체 수집 후 필터)."""
    all_signals = collect_all_signals(hours=hours)
    return all_signals.get(ip, {
        "ssh_attempts": 0, "is_banned": False,
        "suricata_critical": 0, "suricata_high": 0,
        "wazuh_alerts": 0, "kr_blocks": 0, "waf_hits": 0,
    })


def calculate_risk_score(signals: dict,
                          beacon_hit: bool = False,
                          dga_hit: bool = False,
                          misp_hit: bool = False) -> dict:
    """
    신호 → 위험도 점수 계산.
    반환: {"score": 95, "verdict": "Critical", "breakdown": {...}}
    """
    breakdown = {}

    # SSH (100회 이상 = 만점 20)
    ssh = signals.get("ssh_attempts", 0)
    breakdown["ssh"] = min(WEIGHTS["ssh_attempts"], int(ssh / 100 * WEIGHTS["ssh_attempts"]))
    if ssh > 0 and breakdown["ssh"] == 0:
        breakdown["ssh"] = 5  # 1회 이상은 최소 5점

    # fail2ban (차단 이력 = 만점)
    breakdown["fail2ban"] = WEIGHTS["fail2ban_ban"] if signals.get("is_banned") else 0

    # Suricata Critical (1건 = 만점)
    crit = signals.get("suricata_critical", 0)
    breakdown["suricata_critical"] = WEIGHTS["suricata_critical"] if crit >= 1 else 0

    # Suricata High
    high = signals.get("suricata_high", 0)
    breakdown["suricata_high"] = min(WEIGHTS["suricata_high"],
                                     int(high / 3 * WEIGHTS["suricata_high"]))

    # Wazuh
    wazuh = signals.get("wazuh_alerts", 0)
    breakdown["wazuh"] = WEIGHTS["wazuh_high"] if wazuh >= 1 else 0

    # KR-BLOCK
    kr = signals.get("kr_blocks", 0)
    breakdown["kr_block"] = WEIGHTS["kr_block"] if kr >= 1 else 0

    # WAF
    waf = signals.get("waf_hits", 0)
    breakdown["waf"] = WEIGHTS["waf_modsec"] if waf >= 1 else 0

    # 비콘 / DGA / MISP IOC 연계
    breakdown["beacon"] = WEIGHTS["beacon"] if beacon_hit else 0
    breakdown["dga"] = WEIGHTS["dga"] if dga_hit else 0
    breakdown["misp_ioc"] = WEIGHTS["misp_ioc"] if misp_hit else 0

    score = min(100, sum(breakdown.values()))

    if score >= IP_RISK_CRITICAL_THRESHOLD:
        verdict = "Critical"
    elif score >= 80:
        verdict = "Danger"
    elif score >= IP_RISK_HIGH_THRESHOLD:
        verdict = "High"
    elif score >= 30:
        verdict = "Medium"
    else:
        verdict = "Low"

    return {"score": score, "verdict": verdict, "breakdown": breakdown}


def score_all_active_ips(hours: float = 24) -> list[dict]:
    """
    최근 N시간 활동한 모든 외부 IP 스코어링.
    반환: [{"ip": "...", "score": 95, "verdict": "Critical", "signals": {...}}, ...]
    """
    all_signals = collect_all_signals(hours=hours)
    results = []

    for ip, signals in all_signals.items():
        # 1차 점수 — 자체 신호만 (MISP 호출 비용 절약)
        prelim = calculate_risk_score(signals)
        if prelim["score"] == 0:
            continue

        # 점수가 임계 근방인 IP 만 MISP 조회 (Medium 이상)
        misp_hit = False
        misp_info: dict = {}
        if prelim["score"] >= 30:
            misp_info = misp_lookup_ip(ip)
            misp_hit = misp_info.get("hit", False)

        risk = calculate_risk_score(signals, misp_hit=misp_hit)
        signals["misp_hit"] = misp_hit
        if misp_info.get("hit"):
            signals["misp_events"] = misp_info["events"]
            signals["misp_tags"] = misp_info["tags"]

        entry = {
            "ip": ip,
            "score": risk["score"],
            "verdict": risk["verdict"],
            "breakdown": risk["breakdown"],
            "signals": signals,
            "message": (
                f"{ip} | 위험도:{risk['score']} ({risk['verdict']}) | "
                f"SSH:{signals.get('ssh_attempts',0)} "
                f"차단:{'Y' if signals.get('is_banned') else 'N'} "
                f"Suricata:{signals.get('suricata_critical',0)}건 "
                f"MISP:{'Y' if misp_hit else 'N'}"
            ),
        }
        results.append(entry)

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def run(hours: float = 24, target_ip: str = ""):
    console.print(f"\n[bold cyan][ IP 위험도 스코어러 ][/bold cyan] 최근 {hours}시간 분석\n")

    if target_ip:
        signals = get_ip_signals(target_ip, hours=hours)
        risk = calculate_risk_score(signals)
        console.print(f"IP: [bold]{target_ip}[/bold]")
        console.print(f"위험도: [bold]{risk['score']}[/bold] ({risk['verdict']})")
        console.print(f"신호 상세: {signals}")
        console.print(f"점수 분해: {risk['breakdown']}")
        return

    ips = score_all_active_ips(hours=hours)

    if not ips:
        console.print("[green]위험 IP 없음[/green]\n")
        return

    # 상위 20개만 표시
    display = ips[:20]

    table = Table(box=box.ROUNDED, show_header=True, header_style="bold magenta")
    table.add_column("판정", width=9)
    table.add_column("IP", style="cyan", width=18)
    table.add_column("점수", justify="right")
    table.add_column("SSH", justify="right")
    table.add_column("차단", justify="center")
    table.add_column("Suricata C", justify="right")
    table.add_column("Wazuh", justify="right")
    table.add_column("KR-BLK", justify="right")

    verdict_colors = {
        "Critical": "bold red",
        "Danger": "bold magenta",
        "High": "bold orange3",
        "Medium": "yellow",
        "Low": "green",
    }

    for entry in display:
        s = entry["signals"]
        color = verdict_colors.get(entry["verdict"], "white")
        table.add_row(
            f"[{color}]{entry['verdict']}[/{color}]",
            entry["ip"],
            str(entry["score"]),
            str(s.get("ssh_attempts", 0)),
            "[red]Y[/red]" if s.get("is_banned") else "N",
            str(s.get("suricata_critical", 0)),
            str(s.get("wazuh_alerts", 0)),
            str(s.get("kr_blocks", 0)),
        )
        if entry["verdict"] in ("Critical", "Danger", "High"):
            send_alert("ip_risk_scorer", entry["verdict"], entry)
        if entry["verdict"] == "Critical":
            auto_ban(entry["ip"], entry["score"], entry["signals"])
            shuffle_trigger("ip_critical", entry)
        if entry["verdict"] in THEHIVE_AUTO_CASE_VERDICTS:
            techniques = resolve_technique("ip_risk_scorer", None, entry["signals"]) or []
            case_result = thehive_create_case(
                title=f"[XDR] Critical IP {entry['ip']} score={entry['score']}",
                description=(
                    f"위험도: {entry['score']} ({entry['verdict']})\n"
                    f"signals: {entry['signals']}\n"
                    f"breakdown: {entry['breakdown']}"
                ),
                verdict=entry["verdict"],
                tags=[f"src:{entry['ip']}"] + [f"attack:{t}" for t in techniques],
                source="ip_risk_scorer",
            )
            # alert jsonl + UI 에서 케이스 링크 만들 수 있게 case_id 보존
            if case_result.get("created"):
                entry["thehive_case_id"] = case_result.get("case_id")

    console.print(table)
    console.print(f"\n[bold]총 {len(ips)}개 IP 위험도 분석 완료 (상위 {len(display)}개 표시)[/bold]\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IP 위험도 스코어러")
    parser.add_argument("--hours", type=float, default=24.0, help="분석 시간 범위 (기본 24시간)")
    parser.add_argument("--ip", type=str, default="", help="특정 IP 단독 조회")
    args = parser.parse_args()
    run(hours=args.hours, target_ip=args.ip)
