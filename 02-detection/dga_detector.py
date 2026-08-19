"""
DGA 탐지기 (Domain Generation Algorithm Detector)
Shannon Entropy + 어휘적 피처로 악성 도메인 탐지.

실행: bash run.sh dga_detector.py [--hours 1]
"""
import argparse
import math
import re
from collections import Counter, defaultdict

from rich.console import Console
from rich.table import Table
from rich import box

from config import DGA_ENTROPY_THRESHOLD, is_internal_ip
from loki_client import get_zeek_dns, parse_json_line
from alert_manager import send_alert

console = Console()

# ────────────────────────────────────────────
# 화이트리스트 — 정상 도메인 (탐지 제외)
# ────────────────────────────────────────────
WHITELIST = {
    # 대형 CDN / 클라우드
    "google.com", "googleapis.com", "gstatic.com", "googleusercontent.com",
    "cloudflare.com", "cloudflare-dns.com", "cloudflareinsights.com",
    "amazonaws.com", "awsstatic.com", "aws.amazon.com",
    "microsoft.com", "microsoftonline.com", "windows.com", "windowsupdate.com",
    "office.com", "office365.com", "live.com", "outlook.com",
    "apple.com", "icloud.com", "mzstatic.com",
    "akamai.com", "akamaiedge.net", "akamaized.net",
    "fastly.net", "fastly.com",
    "github.com", "githubusercontent.com",
    "ubuntu.com", "canonical.com", "launchpad.net",
    "debian.org",
    "python.org", "pypi.org",
    "docker.com", "dockerhub.io",
    "grafana.com", "grafana.net",
    "letsencrypt.org",
    "digicert.com", "sectigo.com", "comodo.com",
    "ocsp.digicert.com",
    # DNS 인프라
    "in-addr.arpa", "ip6.arpa",
    "local", "localhost",
    # 운영 중인 본인 도메인
    "example.com",
}

# 알려진 정상 TLD 이전 2단계 도메인 패턴 (공유 도메인)
WHITELIST_SUFFIXES = {
    ".google.com", ".googleapis.com", ".gstatic.com",
    ".cloudflare.com", ".amazonaws.com", ".microsoft.com",
    ".windows.com", ".apple.com", ".icloud.com",
    ".akamai.com", ".akamaiedge.net", ".akamaized.net",
    ".fastly.net", ".github.com", ".githubusercontent.com",
    ".ubuntu.com", ".debian.org", ".python.org",
    ".docker.com", ".grafana.com", ".grafana.net",
    ".letsencrypt.org", ".digicert.com", ".in-addr.arpa",
    ".example.com",
}

# 분석 제외 TLD (역방향 DNS, mDNS 등)
SKIP_TLDS = {".arpa", ".local", ".internal", ".localdomain"}


def _get_domain_name(fqdn: str) -> str:
    """FQDN에서 레지스트러블 도메인 추출 (e.g. sub.example.com → example.com)."""
    parts = fqdn.rstrip(".").split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return fqdn


def is_whitelisted(domain: str) -> bool:
    domain = domain.lower().rstrip(".")
    base = _get_domain_name(domain)
    if base in WHITELIST or domain in WHITELIST:
        return True
    for suffix in WHITELIST_SUFFIXES:
        if domain.endswith(suffix):
            return True
    for tld in SKIP_TLDS:
        if domain.endswith(tld):
            return True
    return False


def shannon_entropy(s: str) -> float:
    """문자열 Shannon Entropy 계산."""
    if not s:
        return 0.0
    counter = Counter(s)
    total = len(s)
    return -sum((c / total) * math.log2(c / total) for c in counter.values())


def extract_domain_features(domain: str) -> dict:
    """
    도메인에서 어휘적 피처 추출.
    반환: {"entropy": 3.8, "length": 16, "digit_ratio": 0.3, ...}
    """
    domain = domain.lower().rstrip(".")
    # 서브도메인 제거 — 레지스트러블 도메인 기준 분석
    parts = domain.split(".")
    label = parts[0] if len(parts) >= 2 else domain  # 첫 번째 레이블 분석

    length = len(label)
    if length == 0:
        return {"entropy": 0.0, "length": 0, "digit_ratio": 0.0,
                "vowel_ratio": 0.0, "cv_transitions": 0.0, "unique_char_ratio": 0.0}

    digits = sum(c.isdigit() for c in label)
    vowels = sum(c in "aeiou" for c in label)
    unique_chars = len(set(label))

    # 자음-모음 전환 비율
    cv_transitions = 0
    for i in range(len(label) - 1):
        a_is_vowel = label[i] in "aeiou"
        b_is_vowel = label[i+1] in "aeiou"
        if a_is_vowel != b_is_vowel:
            cv_transitions += 1

    return {
        "entropy": round(shannon_entropy(label), 4),
        "length": length,
        "digit_ratio": round(digits / length, 4),
        "vowel_ratio": round(vowels / length, 4),
        "cv_transitions": round(cv_transitions / max(length - 1, 1), 4),
        "unique_char_ratio": round(unique_chars / length, 4),
    }


def is_dga(domain: str, threshold_entropy: float = DGA_ENTROPY_THRESHOLD) -> dict:
    """
    단일 도메인 DGA 여부 판정.
    반환: {"domain": "...", "is_dga": True, "entropy": 3.8,
             "confidence": 0.87, "reason": "높은 엔트로피 + 긴 도메인"}
    """
    if is_whitelisted(domain):
        return {"domain": domain, "is_dga": False, "whitelisted": True,
                "entropy": 0.0, "confidence": 0.0, "reason": "화이트리스트"}

    feat = extract_domain_features(domain)
    entropy = feat["entropy"]
    length = feat["length"]
    digit_ratio = feat["digit_ratio"]
    vowel_ratio = feat["vowel_ratio"]

    reasons = []
    score = 0.0

    # 규칙 기반 점수 합산
    if entropy > threshold_entropy:
        score += 0.4
        reasons.append(f"높은 엔트로피({entropy:.2f})")
    if length > 12:
        score += 0.2
        reasons.append(f"긴 도메인({length}자)")
    if digit_ratio > 0.3:
        score += 0.2
        reasons.append(f"높은 숫자 비율({digit_ratio:.0%})")
    if vowel_ratio < 0.2:
        score += 0.15
        reasons.append("낮은 모음 비율(발음 불가)")
    if feat["unique_char_ratio"] > 0.8 and length > 8:
        score += 0.1
        reasons.append("높은 문자 다양성")

    is_suspicious = score >= 0.4

    return {
        "domain": domain,
        "is_dga": is_suspicious,
        "whitelisted": False,
        "entropy": entropy,
        "length": length,
        "confidence": round(min(score, 1.0), 4),
        "reason": " + ".join(reasons) if reasons else "정상",
        **feat,
    }


def detect_dga_domains(hours: float = 1) -> list[dict]:
    """
    최근 N시간 Zeek DNS 로그에서 DGA 의심 도메인 탐지.
    NXDOMAIN 우선 처리.
    """
    logs = get_zeek_dns(hours=hours)
    if not logs:
        return []

    # 도메인별 집계
    domain_stats: dict[str, dict] = defaultdict(lambda: {
        "count": 0, "nxdomain_count": 0, "src_ips": set(), "rcode": ""
    })

    for entry in logs:
        labels = entry.get("labels", {})
        line_data = parse_json_line(entry.get("line", ""))

        def _get(*keys):
            for k in keys:
                v = labels.get(k) or line_data.get(k)
                if v and str(v) not in ("-", ""):
                    return str(v)
            return ""

        query = _get("query", "dns_query").lower().rstrip(".")
        if not query or len(query) < 4:
            continue

        src_ip = _get("id_orig_h", "src_ip")
        rcode = _get("rcode_name", "dns_rcode_name")

        domain_stats[query]["count"] += 1
        domain_stats[query]["rcode"] = rcode
        if rcode == "NXDOMAIN":
            domain_stats[query]["nxdomain_count"] += 1
        if src_ip and not is_internal_ip(src_ip):
            domain_stats[query]["src_ips"].add(src_ip)

    results = []
    for domain, stats in domain_stats.items():
        verdict = is_dga(domain)
        if not verdict["is_dga"]:
            continue

        entry = {
            "domain": domain,
            "src_ips": list(stats["src_ips"])[:5],
            "query_count": stats["count"],
            "nxdomain_count": stats["nxdomain_count"],
            "rcode": stats["rcode"],
            "entropy": verdict["entropy"],
            "confidence": verdict["confidence"],
            "reason": verdict["reason"],
            "verdict": "High" if verdict["confidence"] >= 0.6 else "Medium",
        }
        results.append(entry)

    # NXDOMAIN 많은 순 → confidence 순 정렬
    results.sort(key=lambda x: (x["nxdomain_count"], x["confidence"]), reverse=True)
    return results


def run(hours: float = 1):
    console.print(f"\n[bold cyan][ DGA 탐지기 ][/bold cyan] 최근 {hours}시간 분석\n")

    domains = detect_dga_domains(hours=hours)

    if not domains:
        console.print("[green]DGA 의심 도메인 없음[/green]\n")
        return

    table = Table(box=box.ROUNDED, show_header=True, header_style="bold magenta")
    table.add_column("판정", width=8)
    table.add_column("도메인", style="cyan", max_width=40)
    table.add_column("조회수", justify="right")
    table.add_column("NXDOMAIN", justify="right")
    table.add_column("엔트로피", justify="right")
    table.add_column("신뢰도", justify="right")
    table.add_column("이유")

    verdict_colors = {"High": "bold orange3", "Medium": "yellow"}

    for d in domains:
        color = verdict_colors.get(d["verdict"], "white")
        table.add_row(
            f"[{color}]{d['verdict']}[/{color}]",
            d["domain"],
            str(d["query_count"]),
            str(d["nxdomain_count"]),
            str(d["entropy"]),
            f"{d['confidence']:.0%}",
            d["reason"],
        )
        send_alert("dga_detector", d["verdict"], d)

    console.print(table)
    console.print(f"\n[bold]총 {len(domains)}개 DGA 의심 도메인 탐지[/bold]\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DGA 탐지기")
    parser.add_argument("--hours", type=float, default=1.0, help="분석 시간 범위 (기본 1시간)")
    args = parser.parse_args()
    run(hours=args.hours)
