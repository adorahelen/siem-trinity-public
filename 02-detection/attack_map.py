"""
탐지기 결과 → MITRE ATT&CK technique 매핑.

datasets/attack/enterprise-attack.json 의 카탈로그 기준.
명시적으로 technique 을 넘기지 않은 send_alert() 는 DETECTOR_DEFAULTS 를 자동 적용.
"""

# 탐지기 기본 매핑. 동일 탐지기에서 세부 분류(anomaly_type 등) 가 있을 경우 resolve_technique 에서 override.
DETECTOR_DEFAULTS: dict[str, list[str]] = {
    # 비콘 — C2 비콘은 주로 HTTPS/DNS over Application Layer
    "beacon_detector": ["T1071.001", "T1573"],          # Web Protocols + Encrypted Channel

    # DGA — 도메인 생성 알고리즘
    "dga_detector": ["T1568.002"],                       # Dynamic Resolution: DGA

    # 흐름 이상 — 기본은 일반 네트워크 이상. 세부 anomaly_type 별 override.
    "flow_anomaly_detector": ["T1046"],                  # Network Service Discovery (기본)

    # IP 위험도 — 다중 신호 통합이라 단일 매핑 불가. 호출자가 명시 권장.
    "ip_risk_scorer": [],

    # auto_ban — defensive Response. 트리거가 된 공격 자체로 태그.
    "auto_ban": ["T1110", "T1078"],                      # Brute Force, Valid Accounts
}

# flow_anomaly_detector 의 anomaly_type 별 override
# 키는 flow_anomaly_detector._classify_anomaly() 의 한국어 반환값과 정확히 일치해야 함
# (02-detection/CLAUDE.md §15.10 — 한국어 출력 원칙)
FLOW_ANOMALY_OVERRIDES: dict[str, list[str]] = {
    "포트스캔": ["T1046"],                               # Network Service Discovery
    "대용량 전송": ["T1041", "T1567"],                   # Exfiltration Over C2 / Web Service
    "알려진 C2 포트": ["T1071.001", "T1571"],            # Application Layer + Non-Standard Port
    "네트워크 이상": ["T1046"],
}


def _normalize(technique) -> list[str]:
    if technique is None:
        return []
    if isinstance(technique, str):
        return [technique]
    return list(technique)


def resolve_technique(detector: str, technique, details: dict) -> list[str]:
    """
    호출 순서:
      1. 명시적으로 technique 인자가 넘어왔으면 그대로 사용
      2. 탐지기별 세부 override (flow_anomaly_detector 의 anomaly_type)
      3. DETECTOR_DEFAULTS
      4. 빈 리스트
    """
    explicit = _normalize(technique)
    if explicit:
        return explicit

    if detector == "flow_anomaly_detector":
        atype = details.get("anomaly_type") or details.get("type") or ""
        if atype in FLOW_ANOMALY_OVERRIDES:
            return FLOW_ANOMALY_OVERRIDES[atype]

    return list(DETECTOR_DEFAULTS.get(detector, []))
