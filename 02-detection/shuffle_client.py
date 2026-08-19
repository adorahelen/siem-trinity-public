"""
Shuffle SOAR webhook 트리거 — Critical 사건을 playbook 으로 위임.

epic #4 단계 5:
- ip_risk_scorer Critical IP → POST → Shuffle playbook 1
- (예정) Wazuh active-response → Shuffle playbook 2

설계 원칙:
- SHUFFLE_ENABLED=false 기본 → 어떤 호출도 네트워크 안 감
- 타임아웃 5초 + silent fail → 탐지 파이프라인 차단 안 함
- payload 는 최소 필드 + 원본 alert 전체 첨부 (Shuffle 측에서 분기 처리)
"""
from __future__ import annotations

import json
from typing import Any

try:
    import requests
except ImportError:
    requests = None  # type: ignore

from config import SHUFFLE_ENABLED, SHUFFLE_WEBHOOK_URL


def _enabled() -> bool:
    return bool(SHUFFLE_ENABLED and SHUFFLE_WEBHOOK_URL and requests is not None)


def trigger(event_type: str, payload: dict[str, Any], timeout: float = 5.0) -> bool:
    """
    Shuffle webhook 발화.

    Args:
        event_type: 분기용 라벨 (예: "ip_critical", "wazuh_critical", "auto_ban").
                    Shuffle workflow 의 첫 노드(Webhook) 가 이 키로 라우팅.
        payload:    원본 alert dict — Shuffle workflow 가 사용할 컨텍스트.

    Returns:
        True 송신 성공, False 비활성/실패 (silent).
    """
    if not _enabled():
        return False

    body = {"event_type": event_type, "source": "siem-trinity/02-detection", **payload}
    try:
        resp = requests.post(
            SHUFFLE_WEBHOOK_URL,
            data=json.dumps(body, default=str),
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
        return 200 <= resp.status_code < 300
    except Exception:
        return False
