import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent

LOKI_URL = os.getenv("LOKI_URL", "http://localhost:3100")
ALERT_LOG_PATH = Path(os.getenv("ALERT_LOG_PATH", str(BASE_DIR / "reports")))
MODELS_PATH = BASE_DIR / "models"
DATA_PATH = BASE_DIR / "data"

BEACON_THRESHOLD_COV = float(os.getenv("BEACON_THRESHOLD_COV", "0.3"))
BEACON_MIN_CONNECTIONS = int(os.getenv("BEACON_MIN_CONNECTIONS", "10"))

DGA_ENTROPY_THRESHOLD = float(os.getenv("DGA_ENTROPY_THRESHOLD", "3.5"))

FLOW_CONTAMINATION = float(os.getenv("FLOW_CONTAMINATION", "0.01"))

IP_RISK_HIGH_THRESHOLD = int(os.getenv("IP_RISK_HIGH_THRESHOLD", "70"))
IP_RISK_CRITICAL_THRESHOLD = int(os.getenv("IP_RISK_CRITICAL_THRESHOLD", "90"))

# XDR 단계 2: fail2ban 자동 차단
AUTO_BAN_ENABLED = os.getenv("AUTO_BAN_ENABLED", "false").lower() == "true"
AUTO_BAN_THRESHOLD = int(os.getenv("AUTO_BAN_THRESHOLD", "90"))
AUTO_BAN_JAIL = os.getenv("AUTO_BAN_JAIL", "siem-trinity")
AUTO_BAN_WHITELIST_IPS = {
    ip.strip() for ip in os.getenv("AUTO_BAN_WHITELIST_IPS", "").split(",") if ip.strip()
}
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_CRITICAL_WEBHOOK_URL", "")

# XDR 단계 4: MISP (위협 인텔리전스)
MISP_ENABLED = os.getenv("MISP_ENABLED", "false").lower() == "true"
MISP_URL = os.getenv("MISP_URL", "")
MISP_API_KEY = os.getenv("MISP_API_KEY", "")
MISP_VERIFY_SSL = os.getenv("MISP_VERIFY_SSL", "true").lower() != "false"
MISP_IOC_WEIGHT = int(os.getenv("MISP_IOC_WEIGHT", "30"))   # ip_risk_scorer 가중치

# XDR 단계 5: Shuffle SOAR webhook
SHUFFLE_ENABLED = os.getenv("SHUFFLE_ENABLED", "false").lower() == "true"
SHUFFLE_WEBHOOK_URL = os.getenv("SHUFFLE_WEBHOOK_URL", "")

# XDR 단계 6: TheHive 케이스 관리
THEHIVE_ENABLED = os.getenv("THEHIVE_ENABLED", "false").lower() == "true"
THEHIVE_URL = os.getenv("THEHIVE_URL", "")
THEHIVE_API_KEY = os.getenv("THEHIVE_API_KEY", "")
THEHIVE_AUTO_CASE_VERDICTS = {
    v.strip() for v in os.getenv("THEHIVE_AUTO_CASE_VERDICTS", "Critical").split(",") if v.strip()
}

# 분석·차단 제외 대역
# RFC1918 사설 + loopback + Tailscale CGNAT(100.64.0.0/10)
# Tailscale 대역을 의미 분리: 운영자 본인 자기차단 방지의 1순위 안전망 (CLAUDE.md §5.3).
# 과거 "100." 광역 prefix 는 CGNAT 공인 대역(100.0.0.0/10)까지 잘못 보호하던 문제 정정.
import ipaddress as _ipaddress

_INTERNAL_NETWORKS = [
    _ipaddress.ip_network("10.0.0.0/8"),
    _ipaddress.ip_network("172.16.0.0/12"),
    _ipaddress.ip_network("192.168.0.0/16"),
    _ipaddress.ip_network("127.0.0.0/8"),
]

_TAILSCALE_NETWORKS = [
    _ipaddress.ip_network("100.64.0.0/10"),
]

# 디렉토리 자동 생성
ALERT_LOG_PATH.mkdir(parents=True, exist_ok=True)
MODELS_PATH.mkdir(parents=True, exist_ok=True)
DATA_PATH.mkdir(parents=True, exist_ok=True)


def _parse(ip: str):
    try:
        return _ipaddress.ip_address(ip)
    except (ValueError, TypeError):
        return None


def is_tailscale_ip(ip: str) -> bool:
    """Tailscale CGNAT(100.64.0.0/10). 운영자 자기차단 방지 안전망."""
    addr = _parse(ip)
    return bool(addr and any(addr in n for n in _TAILSCALE_NETWORKS))


def is_internal_ip(ip: str) -> bool:
    """분석·차단 제외 대상. RFC1918/loopback + Tailscale."""
    addr = _parse(ip)
    if not addr:
        return False
    if any(addr in n for n in _INTERNAL_NETWORKS):
        return True
    return is_tailscale_ip(ip)
