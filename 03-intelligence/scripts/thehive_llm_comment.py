"""
TheHive 케이스에 LLM 자연어 분석을 코멘트로 자동 추가.

epic #4 단계 6 마지막 체크박스:
  "03-intelligence 자연어 분석을 케이스 코멘트로 자동 추가"

흐름:
  1. TheHive API 로 케이스 메타데이터/observable 조회
  2. ATT&CK 매핑 (security_knowledge ChromaDB)
  3. LLM 으로 한국어 요약 + 권장 조치 생성
  4. TheHive case 의 comment 로 POST

사용:
  python thehive_llm_comment.py <case_id>

자동화 (단계 5):
  Shuffle workflow 의 마지막 노드가 이 스크립트의 HTTP 엔드포인트 호출 →
  케이스 생성 후 자연어 보강 1회.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

THEHIVE_URL = os.getenv("THEHIVE_URL", "http://thehive-app:9000")
THEHIVE_API_KEY = os.getenv("THEHIVE_API_KEY", "")

PROMPT_TEMPLATE = """\
다음은 SIEM-Trinity XDR 이 자동 생성한 보안 사고 케이스이다. 한국어로 분석하라.

## 케이스 메타데이터
- 제목: {title}
- 심각도: {severity}
- 태그: {tags}

## 본문 (원본 alert)
{description}

## 출력 형식
1. 한 줄 요약 (40자 이내)
2. 공격 유형 추정 (ATT&CK technique ID 와 의미)
3. 위험도 평가 근거 (어떤 신호가 결정적이었는지)
4. 권장 조치 3가지 (우선순위 순)
5. 운영자 주의사항 (오탐 가능성, 추가 확인 필요 항목)

각 항목은 짧고 명확하게. 추측은 명시.
"""


def fetch_case(case_id: str) -> dict:
    import requests
    resp = requests.get(
        f"{THEHIVE_URL.rstrip('/')}/api/v1/case/{case_id}",
        headers={"Authorization": f"Bearer {THEHIVE_API_KEY}"},
        timeout=5,
    )
    resp.raise_for_status()
    return resp.json()


def post_comment(case_id: str, message: str) -> None:
    import requests
    resp = requests.post(
        f"{THEHIVE_URL.rstrip('/')}/api/v1/case/{case_id}/comment",
        json={"message": message},
        headers={
            "Authorization": f"Bearer {THEHIVE_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=5,
    )
    resp.raise_for_status()


def main(case_id: str) -> None:
    if not THEHIVE_API_KEY:
        sys.exit("THEHIVE_API_KEY env 미설정")

    print(f"[+] Fetching case {case_id}", file=sys.stderr)
    case = fetch_case(case_id)
    title = case.get("title", "")
    severity = case.get("severity", 2)
    tags = case.get("tags", []) or []
    description = case.get("description", "")[:3000]

    prompt = PROMPT_TEMPLATE.format(
        title=title, severity=severity,
        tags=", ".join(tags) or "n/a",
        description=description,
    )

    print(f"[+] Calling Agent for LLM analysis ({len(prompt)} chars)", file=sys.stderr)
    from agent import build_agent
    agent = build_agent()
    result = agent.invoke({"messages": [("user", prompt)]})
    answer = ""
    for m in reversed(result.get("messages", [])):
        if getattr(m, "content", None):
            answer = m.content
            break
    if not answer:
        sys.exit("LLM 응답 비어있음")

    print(f"[+] Posting comment to TheHive ({len(answer)} chars)", file=sys.stderr)
    post_comment(case_id, f"**🤖 03-intelligence 자동 분석**\n\n{answer}")
    print(f"[✓] Done — case {case_id}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("case_id", help="TheHive case ID (예: ~12345)")
    args = parser.parse_args()
    main(args.case_id)
