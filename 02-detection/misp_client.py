"""
MISP REST API 클라이언트 — IOC 매칭 전용.

epic #4 단계 4: ip_risk_scorer 가 위험 IP 의 MISP IOC 매칭 여부를 신호로 사용.
- MISP_ENABLED=false 기본 → 어떤 호출도 네트워크 가지 않고 빈 결과 반환
- MISP 인프라가 활성화되지 않은 환경에서도 안전하게 import 가능
- 타임아웃 3초 + 실패 시 silent fail → 탐지 파이프라인 차단 안 함
"""
from __future__ import annotations

import os
from typing import Iterable

try:
    import requests
except ImportError:  # 컨테이너 빌드 시 requests 없을 가능성 대비
    requests = None  # type: ignore

from config import MISP_ENABLED, MISP_URL, MISP_API_KEY, MISP_VERIFY_SSL


def _enabled() -> bool:
    return bool(MISP_ENABLED and MISP_URL and MISP_API_KEY and requests is not None)


def _headers() -> dict:
    return {
        "Authorization": MISP_API_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def lookup_ip(ip: str, timeout: float = 3.0) -> dict:
    """
    단일 IP 가 MISP IOC 에 매칭되는지 조회.

    Returns:
        {"hit": bool, "events": int, "categories": list[str], "tags": list[str]}
        실패·비활성 시 모두 0/빈 리스트.
    """
    blank = {"hit": False, "events": 0, "categories": [], "tags": []}
    if not _enabled() or not ip:
        return blank

    try:
        resp = requests.post(
            f"{MISP_URL.rstrip('/')}/attributes/restSearch",
            json={"value": ip, "type": "ip-src,ip-dst", "to_ids": 1},
            headers=_headers(),
            verify=MISP_VERIFY_SSL,
            timeout=timeout,
        )
        if resp.status_code != 200:
            return blank
        data = resp.json().get("response", {}).get("Attribute", [])
        if not data:
            return blank

        events = {a.get("event_id") for a in data if a.get("event_id")}
        categories = sorted({a.get("category", "") for a in data if a.get("category")})
        tags: set[str] = set()
        for a in data:
            for t in a.get("Tag", []) or []:
                if t.get("name"):
                    tags.add(t["name"])
        return {
            "hit": True,
            "events": len(events),
            "categories": categories,
            "tags": sorted(tags),
        }
    except Exception:
        return blank


def lookup_ips(ips: Iterable[str], timeout: float = 3.0) -> dict[str, dict]:
    """다수 IP 일괄 조회 (단순 순차 호출). 큰 배치는 별도 배치 엔드포인트 필요."""
    return {ip: lookup_ip(ip, timeout=timeout) for ip in ips}
