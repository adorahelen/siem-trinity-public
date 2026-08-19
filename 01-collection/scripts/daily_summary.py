#!/usr/bin/env python3
"""
daily_summary.py — 보안 이벤트 요약 발송기 (Email + Discord)

동작:
  1. Loki API 에서 지난 24시간(또는 7일) 보안 이벤트를 카테고리별로 집계
  2. Ollama(llama3.2:1b)가 응답 가능하면 자연어 요약 생성
     응답 불가 시 통계만 포함
  3. Email(SMTP) / Discord webhook 양쪽 발송 (설정된 채널만)

실행:
  python3 daily_summary.py            # 일간 (지난 24h)
  python3 daily_summary.py --weekly   # 주간 (지난 7d)
  python3 daily_summary.py --no-email # Discord만
  python3 daily_summary.py --no-discord # 이메일만

cron 등록 예:
  0 9 * * *   /usr/bin/python3 .../daily_summary.py             # 매일 09:00 일간
  0 9 * * 1   /usr/bin/python3 .../daily_summary.py --weekly    # 매주 월 09:00 주간

환경변수:
  LOKI_URL              (기본: http://localhost:3100)
  OLLAMA_URL            (기본: http://localhost:11434)
  OLLAMA_MODEL          (기본: llama3.2:3b)
  SMTP_HOST/PORT/USER/PASSWORD, MAIL_FROM, MAIL_TO   # 이메일용
  DISCORD_DIGEST_WEBHOOK_URL                          # Discord digest 발송용

설계:
  - Email/Discord는 보완관계: 이메일은 풍부한 HTML, Discord는 즉시성·모바일 푸시
  - 양쪽 다 설정되면 양쪽 발송, 한 쪽만 설정되면 그쪽만
"""

import os
import sys
import json
import time
import smtplib
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from collections import Counter

# ── 설정 ────────────────────────────────────────────────────────────────────

CONFIG = {
    "loki_url":     os.getenv("LOKI_URL",     "http://localhost:3100"),
    "ollama_url":   os.getenv("OLLAMA_URL",   "http://localhost:11434"),
    "ollama_model": os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
    "smtp_host":    os.getenv("SMTP_HOST",    "smtp.gmail.com"),
    "smtp_port":    int(os.getenv("SMTP_PORT", "587")),
    "smtp_user":    os.getenv("SMTP_USER",    ""),
    "smtp_pass":    os.getenv("SMTP_PASSWORD",""),
    "mail_from":    os.getenv("MAIL_FROM",    ""),
    "mail_to":      os.getenv("MAIL_TO",      ""),
    "discord_url":  os.getenv("DISCORD_DIGEST_WEBHOOK_URL", ""),
}

# Discord embed 색상 (server-watchdog와 통일)
DISCORD_COLOR = {
    "critical": 15158332,  # red
    "high":     15105570,  # orange
    "warning":  16776960,  # yellow
    "info":     3447003,   # blue
    "ok":       3066993,   # green
}

# ── Loki 쿼리 ────────────────────────────────────────────────────────────────

def loki_query_range(logql: str, start_ns: int, end_ns: int, limit: int = 5000) -> list[str]:
    """Loki /query_range 호출 → 로그 라인 목록 반환"""
    params = urllib.parse.urlencode({
        "query": logql,
        "start": start_ns,
        "end":   end_ns,
        "limit": limit,
    })
    url = f"{CONFIG['loki_url']}/loki/api/v1/query_range?{params}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
        lines = []
        for stream in data.get("data", {}).get("result", []):
            for _, line in stream.get("values", []):
                lines.append(line)
        return lines
    except Exception as e:
        print(f"[Loki 오류] {logql[:60]}... → {e}")
        return []


def collect_stats(start_ns: int, end_ns: int) -> dict:
    """
    카테고리별 이벤트 집계.
    반환 구조:
      {
        "ssh_fail":    { "count": int, "top_ips": [(ip, n), ...] },
        "fail2ban":    { "count": int, "top_ips": [(ip, n), ...] },
        "waf":         { "count": int, "top_rules": [(rule, n), ...] },
        "wazuh":       { "count": int, "by_level": {"high": n, "medium": n, ...} },
        "kr_block":    { "count": int },
        "kern_error":  { "count": int },
      }
    """
    stats = {}

    # SSH 인증 실패
    ssh_lines = loki_query_range('{job="auth"} |= "Failed password"', start_ns, end_ns)
    ssh_ips = Counter()
    for line in ssh_lines:
        # "Failed password for ... from <IP> port ..."
        parts = line.split(" from ")
        if len(parts) > 1:
            ip = parts[1].split()[0]
            ssh_ips[ip] += 1
    stats["ssh_fail"] = {
        "count":   len(ssh_lines),
        "top_ips": ssh_ips.most_common(5),
    }

    # fail2ban 차단
    f2b_lines = loki_query_range('{job="fail2ban"} |= "Ban"', start_ns, end_ns)
    f2b_ips = Counter()
    for line in f2b_lines:
        # "... Ban <IP>"
        parts = line.split("Ban ")
        if len(parts) > 1:
            ip = parts[1].strip().split()[0]
            f2b_ips[ip] += 1
    stats["fail2ban"] = {
        "count":   len(f2b_lines),
        "top_ips": f2b_ips.most_common(5),
    }

    # WAF (ModSecurity) 탐지
    waf_lines = loki_query_range('{job="modsec"}', start_ns, end_ns)
    rule_ids = Counter()
    for line in waf_lines:
        # "... [id \"942100\"] ..."
        if '[id "' in line:
            rule_id = line.split('[id "')[1].split('"')[0]
            rule_ids[rule_id] += 1
    stats["waf"] = {
        "count":      len(waf_lines),
        "top_rules":  rule_ids.most_common(5),
    }

    # Wazuh 알림 레벨별 집계
    wazuh_lines = loki_query_range('{job="wazuh"}', start_ns, end_ns)
    level_counts = Counter()
    for line in wazuh_lines:
        try:
            obj = json.loads(line)
            lvl = int(obj.get("rule", {}).get("level", 0))
            if lvl >= 12:
                level_counts["critical (≥12)"] += 1
            elif lvl >= 7:
                level_counts["high (7–11)"] += 1
            elif lvl >= 4:
                level_counts["medium (4–6)"] += 1
            else:
                level_counts["low (0–3)"] += 1
        except Exception:
            pass
    stats["wazuh"] = {
        "count":    len(wazuh_lines),
        "by_level": dict(level_counts),
    }

    # 커널 레벨 국가 차단
    kr_block_lines = loki_query_range('{job="kern", kern_event="[KR-BLOCK]"}', start_ns, end_ns)
    stats["kr_block"] = {"count": len(kr_block_lines)}

    # 커널 에러
    kern_lines = loki_query_range('{job="kern"} |~ "(?i)error|oom|panic"', start_ns, end_ns)
    stats["kern_error"] = {"count": len(kern_lines)}

    # Suricata IDS (event_type=alert만 — flow/dns/http 등 제외)
    suricata_lines = loki_query_range('{job="suricata"} |= `"event_type":"alert"`', start_ns, end_ns)
    suri_severities = Counter()
    suri_signatures = Counter()
    for line in suricata_lines:
        try:
            obj = json.loads(line)
            alert = obj.get("alert", {})
            sev = int(alert.get("severity", 0))
            sig = alert.get("signature", "unknown")
            suri_severities[f"sev{sev}"] += 1
            suri_signatures[sig] += 1
        except Exception:
            pass
    stats["suricata"] = {
        "count":         len(suricata_lines),
        "by_severity":   dict(suri_severities),
        "top_sigs":      suri_signatures.most_common(5),
    }

    return stats


# ── Ollama 요약 ──────────────────────────────────────────────────────────────

def ollama_available() -> bool:
    """Ollama API 응답 여부 확인"""
    try:
        with urllib.request.urlopen(f"{CONFIG['ollama_url']}/api/tags", timeout=3):
            return True
    except Exception:
        return False


def ollama_summarize(stats: dict, date_str: str) -> str:
    """
    집계 결과를 llama3.2:1b 에 전달해 자연어 요약 생성.
    Ollama 가 꺼져 있거나 오류 시 빈 문자열 반환 → HTML 이메일에서 생략.
    """
    prompt = f"""The following is a 24-hour security event summary for a Linux server on {date_str}.
Write a concise 3-5 sentence analysis in English.
Highlight any anomalies or threats worth attention. If nothing unusual, state "within normal range".

[Event Data]
- SSH authentication failures: {stats['ssh_fail']['count']}, top IPs: {stats['ssh_fail']['top_ips']}
- fail2ban bans: {stats['fail2ban']['count']}, top IPs: {stats['fail2ban']['top_ips']}
- WAF (ModSecurity) detections: {stats['waf']['count']}, top rules: {stats['waf']['top_rules']}
- Wazuh alerts: {stats['wazuh']['count']}, by level: {stats['wazuh']['by_level']}
- KR-BLOCK firewall drops: {stats['kr_block']['count']}
- Kernel errors/OOM: {stats['kern_error']['count']}
"""
    payload = json.dumps({
        "model":  CONFIG["ollama_model"],
        "prompt": prompt,
        "stream": False,
    }).encode()

    req = urllib.request.Request(
        f"{CONFIG['ollama_url']}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return result.get("response", "").strip()
    except Exception as e:
        print(f"[Ollama 오류] {e}")
        return ""


# ── HTML 이메일 생성 ─────────────────────────────────────────────────────────

def build_html(stats: dict, llm_summary: str, date_str: str) -> str:
    def row(label, value, highlight=False):
        bg = "#fff3cd" if highlight else "#ffffff"
        return f'<tr style="background:{bg}"><td style="padding:6px 12px;border-bottom:1px solid #eee">{label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:bold">{value}</td></tr>'

    def ip_table(top_ips):
        if not top_ips:
            return "<em>없음</em>"
        rows = "".join(f"<tr><td>{ip}</td><td>{n}건</td></tr>" for ip, n in top_ips)
        return f'<table style="font-size:12px">{rows}</table>'

    llm_block = ""
    if llm_summary:
        llm_block = f"""
        <div style="background:#e8f4f8;border-left:4px solid #2196F3;padding:12px 16px;margin:16px 0;border-radius:4px">
          <strong>🤖 AI Summary (llama3.2:3b)</strong><br><br>
          <span style="line-height:1.7">{llm_summary.replace(chr(10), '<br>')}</span>
        </div>"""

    wazuh_levels = "".join(
        f"<li>{k}: {v}건</li>"
        for k, v in stats["wazuh"]["by_level"].items()
    ) or "<li>없음</li>"

    ssh_alert = stats["ssh_fail"]["count"] >= 100
    f2b_alert = stats["fail2ban"]["count"] >= 20

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:700px;margin:auto;padding:20px">

  <h2 style="border-bottom:2px solid #d32f2f;padding-bottom:8px">
    🔐 일일 보안 이벤트 리포트 — {date_str}
  </h2>

  {llm_block}

  <h3>📊 이벤트 요약</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    {row("SSH 인증 실패",     f"{stats['ssh_fail']['count']}건",  ssh_alert)}
    {row("fail2ban 차단",    f"{stats['fail2ban']['count']}건",   f2b_alert)}
    {row("WAF(ModSecurity) 탐지", f"{stats['waf']['count']}건")}
    {row("Wazuh 알림",       f"{stats['wazuh']['count']}건")}
    {row("KR-BLOCK 차단",    f"{stats['kr_block']['count']}건")}
    {row("커널 에러/OOM",    f"{stats['kern_error']['count']}건")}
  </table>

  <h3>🌐 SSH 상위 공격 IP</h3>
  {ip_table(stats['ssh_fail']['top_ips'])}

  <h3>🚫 fail2ban 상위 차단 IP</h3>
  {ip_table(stats['fail2ban']['top_ips'])}

  <h3>🛡️ Wazuh 알림 레벨별</h3>
  <ul style="font-size:14px">{wazuh_levels}</ul>

  <h3>🔥 WAF 상위 탐지 룰</h3>
  {ip_table(stats['waf']['top_rules']) if stats['waf']['top_rules'] else '<em>없음</em>'}

  <hr style="margin-top:24px">
  <p style="font-size:11px;color:#999">
    security-log-monitor · {date_str} · Loki + {"Ollama llama3.2:3b" if llm_summary else "stats only"}
  </p>
</body></html>"""
    return html


# ── Discord 발송 ─────────────────────────────────────────────────────────────

def determine_severity(stats: dict) -> str:
    """집계 결과를 보고 임계 색상 결정."""
    wazuh = stats.get("wazuh", {}).get("by_level", {})
    suri  = stats.get("suricata", {}).get("by_severity", {})
    if wazuh.get("critical (≥12)", 0) > 0 or suri.get("sev1", 0) > 0:
        return "critical"
    if stats.get("ssh_fail", {}).get("count", 0) >= 100:
        return "high"
    if stats.get("fail2ban", {}).get("count", 0) >= 20:
        return "warning"
    if (stats.get("waf", {}).get("count", 0) > 0
            or stats.get("kern_error", {}).get("count", 0) > 0):
        return "info"
    return "ok"


def build_discord_embed(stats: dict, llm_summary: str, date_str: str, period_label: str) -> dict:
    """Discord embed dict 생성 — Ollama 요약 + 카테고리별 카운트."""
    severity = determine_severity(stats)
    icon = {"critical": "🔴", "high": "🟠", "warning": "🟡", "info": "🔵", "ok": "🟢"}[severity]

    fields = []
    fields.append({
        "name": "🔐 SSH 인증 실패",
        "value": f"{stats['ssh_fail']['count']}건"
                 + (f"\n상위: {', '.join(f'{ip}({n})' for ip, n in stats['ssh_fail']['top_ips'][:3])}"
                    if stats['ssh_fail']['top_ips'] else ""),
        "inline": True,
    })
    fields.append({
        "name": "🚫 fail2ban 차단",
        "value": f"{stats['fail2ban']['count']}건"
                 + (f"\n상위: {', '.join(f'{ip}({n})' for ip, n in stats['fail2ban']['top_ips'][:3])}"
                    if stats['fail2ban']['top_ips'] else ""),
        "inline": True,
    })
    fields.append({
        "name": "🛡️ Wazuh",
        "value": f"{stats['wazuh']['count']}건\n"
                 + ", ".join(f"{k}:{v}" for k, v in stats['wazuh']['by_level'].items()) or "없음",
        "inline": True,
    })
    suri = stats.get("suricata", {})
    fields.append({
        "name": "🚨 Suricata IDS",
        "value": f"{suri.get('count', 0)}건\n"
                 + (", ".join(f"{k}:{v}" for k, v in suri.get('by_severity', {}).items()) or "없음"),
        "inline": True,
    })
    fields.append({
        "name": "🔥 WAF (ModSec)",
        "value": f"{stats['waf']['count']}건",
        "inline": True,
    })
    fields.append({
        "name": "🌐 KR-BLOCK",
        "value": f"{stats['kr_block']['count']}건",
        "inline": True,
    })

    description = llm_summary if llm_summary else "*Ollama 응답 없음 — 통계만 포함*"
    if len(description) > 1500:
        description = description[:1500] + "..."

    embed = {
        "title": f"{icon} 보안 {period_label} 리포트 — {date_str}",
        "description": description,
        "color": DISCORD_COLOR[severity],
        "fields": fields,
        "footer": {"text": f"security-log-monitor · severity={severity}"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return embed


def send_discord(stats: dict, llm_summary: str, date_str: str, period_label: str):
    """Discord webhook 발송."""
    url = CONFIG["discord_url"]
    if not url:
        print("[Discord] webhook URL 미설정 — 발송 건너뜀")
        return False

    embed = build_discord_embed(stats, llm_summary, date_str, period_label)
    payload = json.dumps({"embeds": [embed]}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "kangminlog-security-digest/1.0 (+https://github.com/adorahelen/siem-trinity-public)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[Discord] 발송 완료 — http={resp.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[Discord 오류] HTTP {e.code} — {e.read()[:200]}")
        return False
    except Exception as e:
        print(f"[Discord 오류] {e}")
        return False


# ── 이메일 발송 ──────────────────────────────────────────────────────────────

def send_email(subject: str, html_body: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = CONFIG["mail_from"] or CONFIG["smtp_user"]
    msg["To"]      = CONFIG["mail_to"]
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(CONFIG["smtp_host"], CONFIG["smtp_port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(CONFIG["smtp_user"], CONFIG["smtp_pass"])
        server.sendmail(msg["From"], [msg["To"]], msg.as_string())

    print(f"[완료] 이메일 발송 → {msg['To']}")


# ── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="보안 이벤트 요약 발송기")
    parser.add_argument("--weekly", action="store_true", help="주간 모드 (지난 7일 집계)")
    parser.add_argument("--no-email", action="store_true", help="이메일 발송 생략")
    parser.add_argument("--no-discord", action="store_true", help="Discord 발송 생략")
    args = parser.parse_args()

    now      = datetime.now(timezone.utc)
    if args.weekly:
        start = now - timedelta(days=7)
        period_label = "주간"
        period_hours = 24 * 7
    else:
        start = now - timedelta(hours=24)
        period_label = "일간"
        period_hours = 24
    start_ns = int(start.timestamp() * 1e9)
    end_ns   = int(now.timestamp() * 1e9)
    date_str = (now + timedelta(hours=9)).strftime("%Y-%m-%d")  # KST 기준

    print(f"[시작] {date_str} {period_label}({period_hours}h) 보안 이벤트 집계 중...")
    stats = collect_stats(start_ns, end_ns)
    print(f"[집계 완료] SSH={stats['ssh_fail']['count']}, "
          f"fail2ban={stats['fail2ban']['count']}, "
          f"WAF={stats['waf']['count']}, "
          f"Wazuh={stats['wazuh']['count']}, "
          f"Suricata={stats.get('suricata', {}).get('count', 0)}")

    llm_summary = ""
    if ollama_available():
        print("[Ollama] 연결 확인 — LLM 요약 생성 중...")
        llm_summary = ollama_summarize(stats, date_str)
        print(f"[Ollama] 요약 완료 ({len(llm_summary)}자)")
    else:
        print("[Ollama] 응답 없음 — 통계만 발송")

    sent_any = False

    # Discord 발송
    if not args.no_discord:
        if send_discord(stats, llm_summary, date_str, period_label):
            sent_any = True

    # 이메일 발송
    if not args.no_email:
        html    = build_html(stats, llm_summary, date_str)
        subject = f"[보안 {period_label}] {date_str} — SSH {stats['ssh_fail']['count']}건 / fail2ban {stats['fail2ban']['count']}건"
        if CONFIG["smtp_user"] and CONFIG["mail_to"]:
            try:
                send_email(subject, html)
                sent_any = True
            except Exception as e:
                print(f"[이메일 오류] {e}")
        else:
            print("[이메일] SMTP 설정 미완료 — 발송 건너뜀")

    if not sent_any:
        print("[경고] 어느 채널로도 발송되지 않음 — HTML을 /tmp에 저장")
        out = f"/tmp/security_report_{date_str}.html"
        html = build_html(stats, llm_summary, date_str)
        with open(out, "w") as f:
            f.write(html)
        print(f"[디버그] HTML 저장 → {out}")
        sys.exit(1)


if __name__ == "__main__":
    main()
