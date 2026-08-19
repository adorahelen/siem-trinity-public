#!/usr/bin/env python3
"""
security-log-exporter
ss, fail2ban-client, lastb, tailscale 명령 출력을 수집해서 Loki로 전송
변경 없으면 전송 생략 (해시 비교), 실패 시 stderr 출력 (systemd OnFailure 연동)
"""

import subprocess
import requests
import hashlib
import time
import json
import re
import sys
import os
import ipaddress
from datetime import datetime, timezone

LOKI_URL = "http://localhost:3100/loki/api/v1/push"
LOKI_QUERY_URL = "http://localhost:3100/loki/api/v1/query"
HOST = "kangminlog"
HASH_CACHE_DIR = "/tmp/security-log-exporter-cache"
GEO_CACHE_FILE = "/tmp/security-log-exporter-cache/geo_cache.json"
GEO_API_URL = "http://ip-api.com/batch"
NGINX_CONTAINER = "dodgers-nginx-1"
NGINX_ACCESS_RE = re.compile(
    r'^(?P<remote_addr>\S+) - \S+ \[(?P<timestamp>[^\]]+)\] '
    r'"(?P<method>\w+) (?P<request_path>\S+) (?P<protocol>[^"]+)" '
    r'(?P<status_code>\d+) (?P<bytes_sent>\d+) "(?P<referer>[^"]*)" "(?P<user_agent>[^"]*)"'
)

SCANNER_UA_RE = re.compile(
    r"(?:curl|wget|python-requests|python|go-http-client|java/|libwww-perl|scrapy|aiohttp|httpx|bot|spider|crawler|scanner|sqlmap|nikto|masscan|zgrab|nmap)",
    re.IGNORECASE,
)

SUSPICIOUS_PATH_RE = re.compile(
    r"(?:^/(?:wp-login\.php|xmlrpc\.php|phpmyadmin|boaform|cgi-bin|vendor/phpunit|HNAP1|\.env|actuator|admin|login)(?:/|$)|\.\./|%2e%2e|/\.git|/shell|/manager/html)",
    re.IGNORECASE,
)


def sanitize_log_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def user_agent_family(user_agent: str) -> str:
    ua = user_agent.lower()
    if "chrome" in ua and "edg" not in ua:
        return "Chrome"
    if "safari" in ua and "chrome" not in ua:
        return "Safari"
    if "firefox" in ua:
        return "Firefox"
    if "edg" in ua:
        return "Edge"
    if "curl" in ua:
        return "curl"
    if "wget" in ua:
        return "wget"
    if "python" in ua:
        return "Python"
    if not user_agent or user_agent == "-":
        return "Unknown"
    return "Other"


def classify_client(user_agent: str, request_path: str, status_code: str, ip: str) -> str:
    try:
        ip_obj = ipaddress.ip_address(ip)
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
            return "internal"
    except ValueError:
        return "unknown"

    if SCANNER_UA_RE.search(user_agent) or SUSPICIOUS_PATH_RE.search(request_path):
        return "scanner"
    if "mozilla/" in user_agent.lower():
        return "browser"
    if status_code.startswith(("4", "5")) and request_path.startswith("/api/"):
        return "api_client"
    return "script"


def now_ns():
    """현재 시각을 나노초 타임스탬프로 반환"""
    return str(int(time.time() * 1e9))


def get_cached_hash(job: str) -> str:
    """이전 수집 해시 반환. 없으면 빈 문자열"""
    path = os.path.join(HASH_CACHE_DIR, f"{job}.hash")
    try:
        with open(path) as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def save_hash(job: str, hash_val: str):
    """수집 결과 해시 저장"""
    os.makedirs(HASH_CACHE_DIR, exist_ok=True)
    path = os.path.join(HASH_CACHE_DIR, f"{job}.hash")
    with open(path, "w") as f:
        f.write(hash_val)


def content_hash(lines: list[str]) -> str:
    content = "\n".join(lines)
    return hashlib.sha256(content.encode()).hexdigest()


def push_to_loki(job: str, labels: dict, lines: list[str]):
    """변경된 경우에만 Loki push API로 로그 전송"""
    if not lines:
        return

    new_hash = content_hash(lines)
    if new_hash == get_cached_hash(job):
        print(f"[{job}] 변경 없음, 전송 생략")
        return

    base_labels = {"job": job, "host": HOST}
    base_labels.update(labels)

    ts = now_ns()
    values = [[ts, line] for line in lines if line.strip()]

    payload = {
        "streams": [
            {
                "stream": base_labels,
                "values": values,
            }
        ]
    }

    try:
        resp = requests.post(LOKI_URL, json=payload, timeout=5)
        if resp.status_code not in (200, 204):
            raise RuntimeError(f"Loki 전송 실패: {resp.status_code} {resp.text[:200]}")
        save_hash(job, new_hash)
        print(f"[{job}] Loki 전송 완료: {len(values)}건")
    except Exception as e:
        print(f"[{job}] 오류: {e}", file=sys.stderr)
        raise


def run_cmd(cmd: list[str]) -> str:
    """명령 실행 후 stdout 반환. 실패시 예외 발생"""
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        raise RuntimeError(f"명령 실패 {cmd}: {result.stderr.strip()}")
    return result.stdout


def collect_ss():
    """ss -tulpen: 개방 포트 현황"""
    output = run_cmd(["ss", "-tulpen"])
    lines = [line for line in output.splitlines() if line.strip() and not line.startswith("Netid")]
    push_to_loki("ss_ports", {}, lines)


def collect_fail2ban():
    """fail2ban-client status sshd: 차단 IP 현황"""
    output = run_cmd(["sudo", "fail2ban-client", "status", "sshd"])
    lines = [output.strip()]
    match = re.search(r"Currently banned:\s+(\d+)", output)
    if match:
        lines.append(f"summary banned_count={match.group(1)} jail=sshd")
    push_to_loki("fail2ban_status", {"jail": "sshd"}, lines)


def collect_lastb():
    """lastb -n 20: 최근 로그인 실패 이력"""
    output = run_cmd(["sudo", "lastb", "-n", "20"])
    lines = [line for line in output.splitlines() if line.strip() and not line.startswith("btmp")]
    push_to_loki("lastb", {}, lines)


def collect_tailscale():
    """tailscale status: Tailnet 연결 상태"""
    output = run_cmd(["tailscale", "status"])
    lines = [line for line in output.splitlines() if line.strip()]
    push_to_loki("tailscale_status", {}, lines)


def load_geo_cache() -> dict:
    try:
        with open(GEO_CACHE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_geo_cache(cache: dict):
    os.makedirs(HASH_CACHE_DIR, exist_ok=True)
    with open(GEO_CACHE_FILE, "w") as f:
        json.dump(cache, f)


def collect_geo_attacks():
    """fail2ban 차단 IP의 GeoIP 정보를 ip-api.com으로 조회 후 Loki 전송"""
    output = run_cmd(["sudo", "fail2ban-client", "status", "sshd"])
    banned_match = re.search(r"Banned IP list:\s+(.+)", output)
    if not banned_match or not banned_match.group(1).strip():
        print("[geo_attacks] 차단된 IP 없음, 전송 생략")
        return

    banned_ips = banned_match.group(1).strip().split()

    # 캐시에 없는 IP만 조회 (최대 45개 - API 제한)
    geo_cache = load_geo_cache()
    new_ips = [ip for ip in banned_ips if ip not in geo_cache][:45]

    if new_ips:
        try:
            resp = requests.post(
                GEO_API_URL,
                json=[{"query": ip, "fields": "status,country,countryCode,city,lat,lon,query"} for ip in new_ips],
                timeout=10
            )
            if resp.status_code == 200:
                for result in resp.json():
                    if result.get("status") == "success":
                        geo_cache[result["query"]] = result
                save_geo_cache(geo_cache)
        except Exception as e:
            print(f"[geo_attacks] GeoIP 조회 오류: {e}", file=sys.stderr)

    # 전체 차단 IP의 geo 정보를 Loki로 전송
    lines = []
    for ip in banned_ips:
        geo = geo_cache.get(ip, {})
        country = geo.get("country", "Unknown")
        country_code = geo.get("countryCode", "XX")
        city = geo.get("city", "Unknown")
        lat = geo.get("lat", 0)
        lon = geo.get("lon", 0)
        lines.append(
            f'src_ip="{ip}" country="{country}" country_code="{country_code}" '
            f'city="{city}" lat={lat} lon={lon}'
        )

    push_to_loki("geo_attacks", {"type": "banned_ip"}, lines)


def collect_nginx_observability():
    """app-stack nginx 컨테이너 로그를 읽어 상태코드/IP/GeoIP를 전송"""
    output = run_cmd(["docker", "logs", "--since", "24h", NGINX_CONTAINER])
    access_lines = []
    status_counts = {"2xx": 0, "4xx": 0, "5xx": 0}
    visitor_counts: dict[str, int] = {}
    visitor_examples: dict[str, dict] = {}
    enriched_lines = []

    for line in output.splitlines():
        match = NGINX_ACCESS_RE.match(line)
        if not match:
            continue
        access_lines.append(line)
        ip = match.group("remote_addr")
        request_path = match.group("request_path")
        method = match.group("method")
        status_code = match.group("status_code")
        user_agent = match.group("user_agent")
        referer = match.group("referer")
        client_type = classify_client(user_agent, request_path, status_code, ip)
        ua_family = user_agent_family(user_agent)
        visitor_counts[ip] = visitor_counts.get(ip, 0) + 1
        visitor_examples[ip] = {
            "client_type": client_type,
            "ua_family": ua_family,
            "user_agent": user_agent,
        }
        if status_code.startswith("2"):
            status_counts["2xx"] += 1
        elif status_code.startswith("4"):
            status_counts["4xx"] += 1
        elif status_code.startswith("5"):
            status_counts["5xx"] += 1

        enriched_lines.append(
            f'src_ip="{sanitize_log_value(ip)}" method="{sanitize_log_value(method)}" '
            f'request_path="{sanitize_log_value(request_path)}" status_code={status_code} '
            f'client_type="{client_type}" ua_family="{sanitize_log_value(ua_family)}" '
            f'user_agent="{sanitize_log_value(user_agent)}" referer="{sanitize_log_value(referer)}"'
        )

    if not access_lines:
        print("[nginx_observability] access 로그 없음, 전송 생략")
        return

    push_to_loki("nginx_recent_access", {}, access_lines[-200:])
    push_to_loki("nginx_access_enriched", {}, enriched_lines[-500:])
    for status_class, count in status_counts.items():
        push_to_loki(f"nginx_status_{status_class}", {}, [f"request_count={count} window=24h"])

    visitors = sorted(visitor_counts.items(), key=lambda item: item[1], reverse=True)
    geo_cache = load_geo_cache()
    new_ips = [ip for ip, _count in visitors if ip not in geo_cache][:45]

    if new_ips:
        try:
            resp = requests.post(
                GEO_API_URL,
                json=[{"query": ip, "fields": "status,country,countryCode,city,lat,lon,query"} for ip in new_ips],
                timeout=10,
            )
            if resp.status_code == 200:
                for result in resp.json():
                    if result.get("status") == "success":
                        geo_cache[result["query"]] = result
                save_geo_cache(geo_cache)
        except Exception as e:
            print(f"[nginx_visitors_geo] GeoIP 조회 오류: {e}", file=sys.stderr)

    lines = []
    for ip, count in visitors:
        try:
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
                continue
        except ValueError:
            continue
        geo = geo_cache.get(ip, {})
        country = geo.get("country", "Unknown")
        country_code = geo.get("countryCode", "XX")
        city = geo.get("city", "Unknown")
        lat = geo.get("lat", 0)
        lon = geo.get("lon", 0)
        sample = visitor_examples.get(ip, {})
        lines.append(
            f'src_ip="{ip}" request_count={count} country="{country}" '
            f'country_code="{country_code}" city="{city}" lat={lat} lon={lon} '
            f'client_type="{sample.get("client_type", "unknown")}" '
            f'ua_family="{sanitize_log_value(sample.get("ua_family", "Unknown"))}" '
            f'user_agent="{sanitize_log_value(sample.get("user_agent", "Unknown"))}"'
        )

    if lines:
        push_to_loki("nginx_visitors_geo", {"type": "visitor_ip"}, lines)
    else:
        print("[nginx_visitors_geo] 공인 방문자 IP 없음, 전송 생략")


def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] 수집 시작")
    errors = []
    for fn in [
        collect_ss,
        collect_fail2ban,
        collect_lastb,
        collect_tailscale,
        collect_geo_attacks,
        collect_nginx_observability,
    ]:
        try:
            fn()
        except Exception as e:
            errors.append(str(e))

    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        sys.exit(1)  # systemd OnFailure 트리거

    print(f"[{datetime.now(timezone.utc).isoformat()}] 수집 완료")


if __name__ == "__main__":
    main()
