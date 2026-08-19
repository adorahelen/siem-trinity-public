"""
TheHive 5 REST API 클라이언트 — Critical IP 사고를 자동 케이스로 생성.

epic #4 단계 6:
- ip_risk_scorer Critical IP → create_case(title, description, severity, tags)
- 케이스 코멘트는 03-intelligence 의 LLM 이 별도 (단계 6 후속)

설계:
- THEHIVE_ENABLED=false 기본
- 타임아웃 5초 + silent fail
- ATT&CK technique 을 케이스 tag 로 자동 매핑
"""
from __future__ import annotations

from typing import Any

try:
    import requests
except ImportError:
    requests = None  # type: ignore

from config import THEHIVE_ENABLED, THEHIVE_URL, THEHIVE_API_KEY


def _enabled() -> bool:
    return bool(THEHIVE_ENABLED and THEHIVE_URL and THEHIVE_API_KEY and requests is not None)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {THEHIVE_API_KEY}",
        "Content-Type": "application/json",
    }


# TheHive severity 매핑: 1=Low, 2=Medium, 3=High, 4=Critical
VERDICT_TO_SEVERITY = {
    "Low": 1, "Medium": 2, "High": 3, "Danger": 3, "Critical": 4,
}


def create_case(title: str,
                description: str,
                verdict: str = "High",
                tags: list[str] | None = None,
                source: str = "siem-trinity",
                timeout: float = 5.0) -> dict:
    """
    TheHive 5 에 케이스 생성.

    Returns:
        성공: {"created": True, "case_id": "~12345", "url": "...", "raw": {...}}
        실패/비활성: {"created": False, "reason": "..."}
    """
    if not _enabled():
        return {"created": False, "reason": "THEHIVE_ENABLED=false"}

    payload: dict[str, Any] = {
        "title": title[:120],
        "description": description[:4000],
        "severity": VERDICT_TO_SEVERITY.get(verdict, 2),
        "tlp": 2,                  # TLP:Amber 기본
        "pap": 2,                  # PAP:Amber
        "tags": (tags or []) + [source],
        "source": source,
    }

    try:
        resp = requests.post(
            f"{THEHIVE_URL.rstrip('/')}/api/v1/case",
            json=payload,
            headers=_headers(),
            timeout=timeout,
        )
        if resp.status_code not in (200, 201):
            return {"created": False, "reason": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        body = resp.json()
        return {
            "created": True,
            "case_id": body.get("_id") or body.get("id"),
            "url": f"{THEHIVE_URL.rstrip('/')}/cases/{body.get('_id', '')}",
            "raw": body,
        }
    except Exception as e:
        return {"created": False, "reason": f"{type(e).__name__}: {e}"}


def list_cases(limit: int = 50, timeout: float = 5.0) -> list[dict]:
    """최근 케이스 N건 조회 — TrinitySOC BFF 용."""
    if not _enabled():
        return []
    try:
        resp = requests.post(
            f"{THEHIVE_URL.rstrip('/')}/api/v1/query",
            json={
                "query": [
                    {"_name": "listCase"},
                    {"_name": "sort", "_fields": [{"_createdAt": "desc"}]},
                    {"_name": "page", "from": 0, "to": limit},
                ]
            },
            headers=_headers(),
            timeout=timeout,
        )
        if not (200 <= resp.status_code < 300):
            return []
        return resp.json() or []
    except Exception:
        return []


def get_case(case_id: str, timeout: float = 5.0) -> dict | None:
    if not _enabled() or not case_id:
        return None
    try:
        resp = requests.get(
            f"{THEHIVE_URL.rstrip('/')}/api/v1/case/{case_id}",
            headers=_headers(),
            timeout=timeout,
        )
        if not (200 <= resp.status_code < 300):
            return None
        return resp.json()
    except Exception:
        return None


def add_comment(case_id: str, message: str, timeout: float = 5.0) -> bool:
    """케이스에 코멘트 추가 (03-intelligence LLM 호출처)."""
    if not _enabled() or not case_id:
        return False
    try:
        resp = requests.post(
            f"{THEHIVE_URL.rstrip('/')}/api/v1/case/{case_id}/comment",
            json={"message": message[:8000]},
            headers=_headers(),
            timeout=timeout,
        )
        return 200 <= resp.status_code < 300
    except Exception:
        return False
