"""
경보 통합 관리 모듈.
- stdout (rich 컬러 출력)
- reports/alerts_YYYY-MM-DD.jsonl 파일 append
"""
import json
from datetime import datetime
from pathlib import Path

from rich.console import Console

from config import ALERT_LOG_PATH

console = Console(stderr=True)

_VERDICT_STYLES = {
    "Critical": "bold red",
    "High": "bold orange3",
    "Medium": "yellow",
    "Low": "green",
    "Danger": "bold magenta",
}


def send_alert(detector: str, verdict: str, details: dict, technique: str | list[str] | None = None):
    """
    경보 출력 및 파일 기록.

    Args:
        detector: 탐지기 이름 (e.g., "beacon_detector")
        verdict: 판정 등급 (Critical / High / Medium / Low)
        details: 탐지 세부 정보 dict
        technique: MITRE ATT&CK technique ID(s) — 단일 "T1110.001" 또는 ["T1110", "T1078"]
                   미지정 시 02-detection/attack_map.py 의 DETECTOR_DEFAULTS 적용
    """
    from attack_map import resolve_technique  # 지연 import (순환 회피)
    now = datetime.now()
    timestamp = now.strftime("%Y-%m-%d %H:%M:%S")

    techniques = resolve_technique(detector, technique, details)

    # 파일 기록
    record = {
        "timestamp": timestamp,
        "detector": detector,
        "verdict": verdict,
        "attack": techniques,
        **details,
    }
    log_file = ALERT_LOG_PATH / f"alerts_{now.strftime('%Y-%m-%d')}.jsonl"
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass  # 파일 기록 실패는 무시


def load_today_alerts() -> list[dict]:
    """오늘 날짜 경보 파일 로드."""
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = ALERT_LOG_PATH / f"alerts_{today}.jsonl"
    if not log_file.exists():
        return []
    results = []
    try:
        with open(log_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        results.append(json.loads(line))
                    except Exception:
                        pass
    except Exception:
        pass
    return results
