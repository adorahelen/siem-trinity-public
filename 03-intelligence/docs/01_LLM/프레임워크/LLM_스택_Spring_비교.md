# LLM 스택 — Java/Spring 개발과 비교

> 작성일: 2026-03-22
> Ollama, LangChain, Agent 프레임워크를 Java/Spring 개념에 대응해 이해

---

## 1. LLM 런타임 (Ollama 자리)

```
Ollama        =  JVM (Java Virtual Machine)
                 "코드(모델)를 실행해주는 엔진"

  OpenAI API  =  클라우드 서버 (AWS RDS 같은 것)
                 "내가 설치 안 해도 되는 외부 서비스"
                 대신 비용 발생

  vLLM        =  Tomcat / 고성능 WAS
                 프로덕션 트래픽용, 로컬엔 과함

  llama.cpp   =  JVM 소스 직접 빌드해서 쓰는 것
                 가능하지만 불편함
```

---

## 2. 오케스트레이션 프레임워크 (LangChain 자리)

```
LangChain     =  Spring Framework
                 "LLM 앱 만들 때 필요한 것들 다 모아놓은 프레임워크"
                 RAG = Spring MVC 같은 패턴
                 버전 변경 잦음 = Spring Boot 메이저 업 느낌

  LlamaIndex  =  Spring Data JPA
                 "데이터(문서) 검색·인덱싱에 특화"

  직접 구현    =  Servlet 직접 짜는 것
                 프레임워크 없이 HttpURLConnection으로 API 호출
                 단순할 땐 오히려 깔끔

  Haystack    =  Spring Batch
                 대용량 파이프라인, 엔터프라이즈용
```

---

## 3. 에이전트 프레임워크 (Agent 자리)

```
LangChain Agent  =  @Service + 동적 메서드 디스패처
                    단, 라우팅 결정을 if/else가 아닌 LLM이 함
                    (Spring에 완전한 대응 개념 없음 — 아래 설명 참고)

  LangGraph     =  Spring State Machine / Spring Batch Step
                   "탐지 → 분석 → 대응" 상태 흐름 정의
                   복잡한 워크플로우에 적합

  AutoGen       =  MSA (Microservices) 간 이벤트 버스
                   서비스끼리 메시지로 협력
                   탐지봇 → Kafka → 분석봇 → 대응봇 느낌

  CrewAI        =  팀 단위 MSA
                   각 서비스에 역할(Role) 명시적으로 부여
```

---

## 4. 전체 그림 비교

```
Java/Spring 세계          LLM 세계
─────────────────────     ─────────────────────
JVM                   =   Ollama
Spring Framework      =   LangChain
Spring MVC 패턴       =   RAG 패턴
@RestController       =   cli.py / app.py
@Service              =   rag_chain.py
@Repository           =   ChromaDB (벡터 저장소)
외부 DB (MySQL)       =   Loki (로그 저장소)
Spring Data JPA       =   LlamaIndex
Spring State Machine  =   LangGraph
MSA + 이벤트버스      =   AutoGen / CrewAI
AWS RDS (외부 서비스) =   OpenAI API
```

---

## 5. Agent는 Spring에 정확한 대응 개념이 없다

Spring에서 메서드 라우팅은 항상 사람이 규칙을 짠다:

```java
// Spring: 개발자가 if/else로 라우팅 결정
if (query.contains("SSH")) {
    sshService.analyze();
} else if (query.contains("Suricata")) {
    suricataService.analyze();
}
```

Agent는 이 라우팅을 LLM이 런타임에 판단한다:

```python
# Agent: LLM이 알아서 어떤 함수 쓸지 결정
tools = [get_ssh_attacks, get_suricata_alerts, get_fail2ban_bans]
agent.run("오늘 공격 IP 알려줘")
# LLM이 판단: get_ssh_attacks + get_suricata_alerts 둘 다 써야겠다
# → 자동 호출 → 결과 통합 → 답변
```

가장 가까운 Spring 개념을 억지로 비유하면:

```
전략 패턴(Strategy Pattern) + while 루프
  + 전략 선택자가 if/else 대신 LLM
= Agent

단, Spring에서 전략 선택은 항상 개발자가 짠 규칙
Agent에서 전략 선택은 LLM이 자연어 이해로 결정
→ 이 차이가 Agent를 새로운 패러다임으로 만드는 핵심
```

---

## 5-1. Agent — 개발자가 짜는 것 vs LLM이 판단하는 것

**개발자가 하는 것:**
```python
# 1. 도구(함수)를 정의해서 Agent에 등록
tools = [get_ssh_attacks, get_suricata_alerts, get_fail2ban_bans]

# 2. 역할을 자연어로 명시 (시스템 프롬프트)
"당신은 보안 분석가입니다. 질문에 따라 적절한 도구를 선택해 분석하세요."

# 3. Agent 실행
agent.run("오늘 중국발 공격 정리해줘")
```

**LLM이 하는 것:**
```
질문 수신: "오늘 중국발 공격 정리해줘"
  ↓
스스로 판단:
  "SSH 공격 데이터 필요 → get_ssh_attacks 호출해야겠다"
  "Suricata도 봐야겠다 → get_suricata_alerts도 호출"
  ↓
함수 실행 결과 받음
  ↓
"이 정도면 충분하다 → 답변 생성"
```

**한 줄 요약:**
```
개발자:  "어떤 도구들이 있는지" + "역할이 뭔지" 를 정의
LLM:     "어떤 상황에 어떤 도구를 쓸지" 를 스스로 판단·실행
```

**Spring과 비교:**
```
Spring (기존):
  개발자가 if/else 로 분기 작성
  → 명시되지 않은 케이스는 처리 못함

Agent:
  개발자는 도구만 등록
  → 예상 못한 질문도 LLM이 알아서 조합해서 처리
  → 단, LLM이 잘못 판단하면 엉뚱한 함수 호출할 수도 있음 (단점)
```

개발자가 조건문을 작성하는 게 아니라,
**조건 판단 자체를 LLM에게 위임하는 것**이 Agent의 본질.

---

## 5-2. Agent 도입 — 설치/설정 필요량

현재 설치된 것으로 이미 충분하다. 추가 설치 없음.

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
loki_client.py  → 그대로 재사용 (함수들 이미 있음)
@tool 데코레이터 → 기존 함수 위에 붙이기만
AgentExecutor   → RAG chain 대신 이걸로 실행

새로 설치할 패키지: 없음
새로 만들 파일:     agent.py 하나
```

---

## 6. 현재 프로젝트를 Spring으로 비유하면

```
지금:
  JVM(Ollama) + Spring(LangChain) + MVC 패턴(RAG)
  = 모놀리식 Spring 앱 하나

Agent 추가하면:
  LLM이 loki_client.py 함수들을 알아서 선택·호출
  = 라우팅 로직을 if/else 대신 LLM에게 위임

LangGraph 추가하면:
  탐지 → 분석 → 대응 흐름을 State로 정의
  = Spring Batch Job 여러 Step으로 분리

AutoGen 추가하면:
  탐지/분석/대응 에이전트가 각각 독립적으로 동작
  = MSA 전환
```
