# Agent / Tool — 개념 및 이 프로젝트 적용 방법

> 작성일: 2026-03-19
> 관련 파일: `rag_chain.py`

---

## LangChain → Agent 관계 정리

**"LangChain을 Agent로 교체"가 아닙니다.**
Agent는 LangChain 안에 있는 기능입니다.

```
LangChain (프레임워크)
├── Chain  ← 현재 이 프로젝트 (RAG 파이프라인 고정)
└── Agent  ← 다음 단계 (LLM이 파이프라인을 스스로 선택)
```

즉 **LangChain은 그대로**, 사용하는 방식이 Chain → Agent로 진화하는 것입니다.

---

## Chain vs Agent 차이

```
Chain (현재):
  질문 → 항상 벡터검색 → LLM → 답변
  경로 고정, LLM은 답변만 생성

Agent (다음 단계):
  질문 → LLM이 판단
           ├─ "벡터검색 필요" → 검색 → 답변
           ├─ "SSH 조회 필요" → tool_ssh_attacks() → 답변
           ├─ "보고서 필요"   → tool_generate_report() → 답변
           └─ "바로 답 가능"  → 즉시 답변
  경로 동적, LLM이 도구 선택 및 실행까지 담당
```

---

## Agent 구현 방법 (이 프로젝트 기준)

### 1단계 — Tool 등록

```python
# rag_chain.py 에 추가
from langchain.tools import tool

@tool
def tool_ssh_attacks(hours: int = 1) -> str:
    """SSH 공격 시도 로그를 조회한다. hours: 조회할 시간 범위"""
    result = loki_client.get_ssh_attacks(hours=hours)
    return f"SSH 공격 {len(result)}건: " + str(result[:5])

@tool
def tool_fail2ban_bans(hours: int = 1) -> str:
    """fail2ban이 차단한 IP 목록을 조회한다."""
    result = loki_client.get_fail2ban_bans(hours=hours)
    return f"차단 IP {len(result)}건: " + str(result[:5])

@tool
def tool_generate_report(_: str = "") -> str:
    """오늘의 보안 보고서를 생성한다."""
    import report
    path = report.generate_daily_report()
    return f"보고서 생성 완료: {path}"
```

### 2단계 — Agent 생성

```python
from langchain.agents import create_react_agent, AgentExecutor

tools = [tool_ssh_attacks, tool_fail2ban_bans, tool_generate_report]
agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
```

### 3단계 — 실행

```python
# 사용자 입력 하나로 LLM이 알아서 여러 Tool 호출
agent_executor.invoke({"input": "최근 1시간 공격 현황 조회하고 보고서 만들어줘"})
```

---

## 이 프로젝트에 추가 가능한 Tool 목록

| Tool | 기반 함수 | 읽기/쓰기 |
|------|---------|---------|
| SSH 공격 조회 | `loki_client.get_ssh_attacks()` | 읽기 ✅ |
| Suricata 알림 조회 | `loki_client.get_suricata_alerts()` | 읽기 ✅ |
| Wazuh 알림 조회 | `loki_client.get_wazuh_alerts()` | 읽기 ✅ |
| 공격 IP TOP 20 | `loki_client.get_top_attack_ips()` | 읽기 ✅ |
| 일간 보고서 생성 | `report.generate_daily_report()` | 쓰기(로컬) ✅ |
| 로그 동기화 | `embedder.sync_recent_logs()` | 쓰기(ChromaDB) ✅ |
| 방화벽 차단 | `iptables` / `fail2ban-client` | ⚠️ 서버 쓰기 — 원칙 위반 |

> 서버 파일/서비스 수정 금지 원칙(CLAUDE.md 6조)에 따라 방화벽 차단 Tool은 추가하지 않음

---

## Agent 대표 패턴

| 패턴 | 설명 | 대표 제품 |
|------|------|---------|
| **ReAct** | Reason(추론) + Act(행동) 반복 | LangChain Agent |
| **Function Calling** | LLM이 JSON으로 함수 호출 명세 반환 | OpenAI, Claude |
| **Plan-and-Execute** | 전체 계획 먼저 수립 후 순서대로 실행 | LangGraph |
| **Multi-Agent** | 여러 Agent가 역할 분담 협업 | AutoGen, CrewAI |
