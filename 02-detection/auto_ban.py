"""
XDR 단계 2 — fail2ban 자동 차단 (첫 R = Response).

ip_risk_scorer가 Critical(score >= AUTO_BAN_THRESHOLD)로 판정한 IP를
fail2ban-client로 차단 요청한다.

안전장치:
- AUTO_BAN_ENABLED=false (기본): 절대 실제 차단하지 않고 dry-run 기록만 남김
- 화이트리스트: 내부 IP, Tailscale 100.x, 사용자 지정 IP는 어떤 경우에도 차단 금지
- 모든 호출은 alerts JSONL에 기록 (verdict="AutoBan" 또는 "DryRunBan")
- DISCORD_CRITICAL_WEBHOOK_URL 설정 시 Discord 알림 송신

운영자 자기 차단 = 1순위 리스크 (CLAUDE.md §5.3). dry-run 1주일 관찰 후 활성화 권장.
"""
import json
import os
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone

from config import (
    AUTO_BAN_ENABLED,
    AUTO_BAN_JAIL,
    AUTO_BAN_THRESHOLD,
    AUTO_BAN_WHITELIST_IPS,
    DISCORD_WEBHOOK_URL,
    is_internal_ip,
    is_tailscale_ip,
)
from alert_manager import send_alert


def _is_whitelisted(ip: str) -> tuple[bool, str]:
    # Tailscale 명시 검사 — is_internal_ip 도 포함하지만, 의미를 코드로 박아 향후
    # "내부 IP 정리" 시 운영자 자기차단 가능성을 차단.
    if is_tailscale_ip(ip):
        return True, "tailscale"
    if is_internal_ip(ip):
        return True, "internal_ip"
    if ip in AUTO_BAN_WHITELIST_IPS:
        return True, "explicit_whitelist"
    return False, ""


def _notify_discord(ip: str, score: int, dry_run: bool, signals: dict) -> None:
    if not DISCORD_WEBHOOK_URL:
        return
    icon = "🟡" if dry_run else "🔴"
    title = f"{icon} {'[DRY-RUN] ' if dry_run else ''}IP 자동 차단 — {ip}"
    fields = [
        {"name": "위험도", "value": str(score), "inline": True},
        {"name": "Jail", "value": AUTO_BAN_JAIL, "inline": True},
        {"name": "SSH 시도", "value": str(signals.get("ssh_attempts", 0)), "inline": True},
        {"name": "fail2ban 이력", "value": "Y" if signals.get("is_banned") else "N", "inline": True},
        {"name": "Suricata Critical", "value": str(signals.get("suricata_critical", 0)), "inline": True},
        {"name": "Wazuh", "value": str(signals.get("wazuh_alerts", 0)), "inline": True},
    ]
    payload = json.dumps({
        "embeds": [{
            "title": title,
            "color": 0xE67E22 if dry_run else 0xE74C3C,
            "fields": fields,
            "footer": {"text": "siem-trinity · ip_risk_scorer.auto_ban"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }]
    }).encode()
    req = urllib.request.Request(
        DISCORD_WEBHOOK_URL, data=payload, method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10).close()
    except (urllib.error.URLError, OSError):
        pass


def _exec_fail2ban_ban(ip: str) -> tuple[bool, str]:
    """fail2ban-client로 실제 차단 실행. (success, stderr_msg)."""
    try:
        proc = subprocess.run(
            ["fail2ban-client", "set", AUTO_BAN_JAIL, "banip", ip],
            capture_output=True, text=True, timeout=10,
        )
        if proc.returncode == 0:
            return True, proc.stdout.strip()
        return False, proc.stderr.strip() or proc.stdout.strip()
    except FileNotFoundError:
        return False, "fail2ban-client not found in PATH"
    except subprocess.TimeoutExpired:
        return False, "fail2ban-client timeout"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def auto_ban(ip: str, score: int, signals: dict) -> dict:
    """
    위험 IP 자동 차단 진입점.

    Args:
        ip: 대상 IP
        score: ip_risk_scorer 점수 (0~100)
        signals: ip_risk_scorer.collect_all_signals()의 IP별 dict

    Returns:
        {"action": "ban|dry_run|skipped", "reason": "...", "ip": ip, "score": score}
    """
    result = {"ip": ip, "score": score, "jail": AUTO_BAN_JAIL}

    if score < AUTO_BAN_THRESHOLD:
        result.update(action="skipped", reason=f"below_threshold({AUTO_BAN_THRESHOLD})")
        return result

    whitelisted, wl_reason = _is_whitelisted(ip)
    if whitelisted:
        result.update(action="skipped", reason=f"whitelist:{wl_reason}")
        send_alert("auto_ban", "Skipped", result)
        return result

    if not AUTO_BAN_ENABLED:
        result.update(action="dry_run", reason="AUTO_BAN_ENABLED=false")
        send_alert("auto_ban", "DryRunBan", {**result, "signals": signals})
        _notify_discord(ip, score, dry_run=True, signals=signals)
        return result

    ok, msg = _exec_fail2ban_ban(ip)
    if ok:
        result.update(action="ban", reason="fail2ban_ok", stdout=msg)
        send_alert("auto_ban", "AutoBan", {**result, "signals": signals})
        _notify_discord(ip, score, dry_run=False, signals=signals)
    else:
        result.update(action="skipped", reason=f"fail2ban_error:{msg}")
        send_alert("auto_ban", "AutoBanFailed", {**result, "signals": signals})
    return result
