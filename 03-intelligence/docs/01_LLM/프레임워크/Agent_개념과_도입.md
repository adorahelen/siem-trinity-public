# Agent — 개념, 도입 방법, 한계

> 작성일: 2026-03-22
> LangChain Agent의 본질, Spring과의 차이, 블랙박스 문제

---

## 1. Agent란

```
개발자:  "어떤 도구들이 있는지" + "역할이 뭔지" 를 정의
LLM:     "어떤 상황에 어떤 도구를 쓸지" 를 스스로 판단·실행
```

Spring(기존)과의 핵심 차이:

```
Spring (기존):
  개발자가 if/else 로 분기 작성
  → 명시되지 않은 케이스는 처리 못함

Agent:
  개발자는 도구만 등록
  → 예상 못한 질문도 LLM이 알아서 조합해서 처리
  → 단, LLM이 잘못 판단하면 엉뚱한 함수 호출할 수도 있음
```

개발자가 조건문을 작성하는 게 아니라,
**조건 판단 자체를 LLM에게 위임하는 것**이 Agent의 본질.

---

## 2. Agent 실행 흐름

```
질문 수신: "오늘 중국발 공격 정리해줘"
  ↓
LLM 스스로 판단:
  "SSH 공격 데이터 필요 → get_ssh_attacks 호출해야겠다"
  "Suricata도 봐야겠다 → get_suricata_alerts도 호출"
  ↓
함수 실행 결과 받음
  ↓
"이 정도면 충분하다 → 답변 생성"
```

---

## 3. 도입 난이도 — 거의 딸깍 수준

현재 설치된 패키지로 이미 가능. 추가 설치 없음.

```bash
# 이미 설치됨
pip install langchain langchain-community langchain-ollama
```

**현재 RAG 방식:**
```python
from rag_chain import query
answer = query("오늘 SSH 공격 알려줘")
```

**Agent 방식:**
```python
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools import tool

@tool
def ssh_attacks(hours: int = 24) -> str:
    """SSH 공격 이벤트를 조회한다"""
    return str(get_ssh_attacks(hours))

@tool
def suricata_alerts(hours: int = 24) -> str:
    """Suricata IDS 알림을 조회한다"""
    return str(get_suricata_alerts(hours))

tools = [ssh_attacks, suricata_alerts]
agent = create_react_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools)

executor.invoke({"input": "오늘 SSH 공격 알려줘"})
```

**실제로 추가되는 것:**
```
loki_client.py   → 그대로 재사용 (함수들 이미 있음)
@tool 데코레이터  → 기존 함수 위에 붙이기만
AgentExecutor    → RAG chain 대신 이걸로 실행

새로 설치할 패키지: 없음
새로 만들 파일:     agent.py 하나
```

---

## 4. 블랙박스 문제

전체 스택이 블랙박스 구조:

```
개발자가 보이는 것:
  tools = [get_ssh_attacks, get_suricata_alerts]
  executor.invoke({"input": "오늘 공격 정리해줘"})
  → 답변 나옴

개발자가 못 보는 것:
  LLM이 내부적으로
    "어떤 함수를 왜 골랐는지"
    "몇 번 반복했는지"
    "어떤 순서로 실행했는지"
  → 결과만 나옴
```

**계층별 블랙박스 정도:**

```
Ollama      완전 블랙박스
              llama.cpp 내부 연산 불투명
              토큰 생성 과정 모름

LangChain   반투명
              체인 각 단계 로그 볼 수 있음
              LLM 판단 과정은 모름

Agent       가장 불투명
              "왜 이 함수를 골랐는가?" 설명 안 됨
              ReAct 방식 쓰면 Thought 과정 일부 볼 수 있음
              그래도 LLM 내부 판단은 여전히 블랙박스
```

**보안 관점에서 왜 문제인가:**

```
Spring (기존):
  버그 → 코드 보면 원인 찾음
  감사(Audit) → 로그 보면 정확히 뭐 했는지 나옴

Agent:
  버그 → "LLM이 왜 그 판단을 했는지" 모름
  오탐 → "왜 이 IP를 공격자로 봤는지" 설명 어려움
  규제/감사 → "AI가 그렇게 판단했다"는 답변이 됨
```

이게 XDR 자동 대응에서 가장 큰 걸림돌.
IP 자동 차단 같은 행동은 "왜?"를 설명할 수 있어야 하는데,
Agent는 그게 어려움.

---

## 4-1. LangChain과 Agent는 LLM 없이 동작하는가

**LangChain:**
```
LLM 없이도 쓸 수 있는 것들:
  문서 로더 (PDF, 텍스트 읽기)
  텍스트 분리 (Chunking)
  벡터 DB 연결 (ChromaDB, Pinecone)
  프롬프트 템플릿 관리

LLM 없으면 의미 없는 것들:
  Chain (질의응답)
  RAG (검색 + 생성)
  요약, 번역

→ 실질적으로 LangChain을 쓰는 이유 자체가 LLM 연결이라
  LLM 없이 쓰는 경우는 거의 없음
```

**Agent:**
```
LLM 필수.

Agent의 본질 자체가
"LLM이 판단해서 도구를 선택"이기 때문에
LLM 없으면 Agent가 아님.

LLM 없이 자동으로 함수 선택하려면
→ 그냥 if/else 로직으로 돌아가는 것
```

**단, LLM 종류는 선택 가능:**
```
Ollama (로컬)    현재 사용, 무료, 오프라인
OpenAI API       GPT-4o, 비용 발생
Anthropic API    Claude, 비용 발생
Gemini API       Google, 비용 발생

LangChain/Agent가 특정 LLM에 묶여있는 게 아니라
.env 에서 어떤 LLM 쓸지 교체 가능
```

---

## 4-2. Agent 쓰면 개발자 할 일이 줄어드는가

```
줄어드는 것:
  if/else 분기 로직       → LLM이 판단
  함수 호출 순서 결정     → LLM이 결정
  케이스별 처리 코드      → LLM이 조합

여전히 개발자 몫:
  도구(함수) 정의          필수, 없으면 LLM이 쓸 게 없음
  시스템 프롬프트 작성     "너는 보안 분석가야" 역할 부여
  도구 설명 잘 쓰기        LLM이 함수 선택 근거로 씀
  오류 처리               LLM이 무한루프 돌거나 틀린 함수 부를 때
  품질 평가               "LLM 판단이 맞는가" 검증
  보안 경계 설정           LLM이 절대 하면 안 되는 것 제한
```

줄어드는 게 아니라 **하는 일의 종류가 바뀌는 것**에 가까움.
로직 짜기 → 프롬프트 엔지니어링 + 평가로 무게중심 이동.

---

## 4-3. Claude Code도 Agent인가

맞음. Claude Code는 Agent 패턴의 실제 동작 예시다.

```
사용자:  "README 수정해줘"  ← 자연어 지시

Claude:  어떤 도구 쓸지 판단
           Read   → 파일 읽기
           Edit   → 파일 수정
           Bash   → 명령 실행
           Grep   → 검색
         순서 결정 → 실행 → 결과 확인 → 다음 판단

= 완전한 Agent 패턴
```

Anthropic이 Claude Code에 준 것:
```
도구 목록      Read, Edit, Bash, Grep, Glob, Write...
시스템 프롬프트  "소프트웨어 엔지니어링 도우미"
```

Claude Code가 하는 것:
```
자연어 지시 → 어떤 도구를 어떤 순서로 쓸지 판단 → 실행
```

이 프로젝트에서 만들려는 보안 Agent도 구조가 동일:
```
Anthropic이 Claude Code에 준 것   →   개발자가 보안 Agent에 줄 것
─────────────────────────────────     ────────────────────────────
Read, Edit, Bash, Grep...         →   get_ssh_attacks, get_suricata_alerts...
"소프트웨어 엔지니어링 도우미"    →   "보안 분석가, Loki 로그 분석"
```

---

## 5. 선택 가능한 Agent 프레임워크

```
LangChain Agent   현재 코드베이스와 연결 가장 쉬움
                  추가 설치 없음, agent.py 하나로 도입 가능

LangGraph         LangChain Agent 고도화 버전
                  상태 기반 워크플로우 (State Machine)
                  "탐지 → 분석 → 대응" 흐름 구현에 적합
                  Spring State Machine과 유사

AutoGen           Microsoft, 멀티에이전트 특화
                  에이전트끼리 대화하며 문제 해결
                  탐지봇 ↔ 분석봇 ↔ 대응봇 구조

CrewAI            역할 기반 멀티에이전트
                  AutoGen보다 직관적
```

---

## 6. 이 프로젝트에서 Agent 도입 로드맵

```
현재:
  사람이 질문 → RAG → LLM 답변

Agent 추가 후:
  사람이 질문 → LLM이 Loki 함수 선택·호출 → 분석 → 답변
  ChromaDB 동기화 불필요, 항상 최신 데이터

Agent + 스케줄러:
  사람 없이 주기적으로 LLM이 로그 확인
  이상 발견 시 자동 알림
  = "자동 모니터링 봇"

Agent + 스케줄러 + 이상탐지 ML + 대응:
  = 진짜 XDR
```
