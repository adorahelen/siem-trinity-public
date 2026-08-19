"""
rag_chain.py — LangChain RAG 체인 (Chroma + Ollama)
"""

import os
from datetime import datetime, timezone

import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv
from langchain_ollama import OllamaLLM
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OllamaEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

import loki_client

load_dotenv()

CHROMA_PATH  = os.getenv("CHROMA_PATH", "/app/chroma_db")
OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e2b-it-q4_K_M")
EMBED_MODEL  = os.getenv("EMBED_MODEL", "nomic-embed-text")


# ─────────────────────────────────────────────
# 시스템 프롬프트
# ─────────────────────────────────────────────

def get_system_prompt() -> str:
    return """당신은 리눅스 서버 보안 분석 전문가이자 친절한 보안 어시스턴트입니다.

# 응답 방식
- 인사말이나 일상 대화에는 짧고 자연스럽게 응답하십시오. 보안 분석을 억지로 끼워넣지 마십시오.
- 보안/로그 관련 질문에만 아래 [보안 분석 형식]을 사용하십시오.
- 판단이 애매하면 간단히 인사한 뒤 "보안 관련 질문이 있으시면 말씀해 주세요"라고 안내하십시오.

# 보안 분석 형식 (보안 질문에만 적용)
1. 한국어로 답변
2. 구체적 수치 포함 (건수, IP 주소, 시간대)
3. 위험도 명시: [낮음 / 중간 / 높음 / 심각]
4. 실행 가능한 권고 조치 포함
5. 컨텍스트에 없는 내용은 "해당 데이터가 확인되지 않습니다"라고 명시

# 참고 데이터

[보안 지식 (KISA/MITRE/플레이북)]
{context}

[실시간 현황 (Loki)]
{realtime}

# 사용자 질문
{question}

답변:"""


# ─────────────────────────────────────────────
# 체인 빌드
# ─────────────────────────────────────────────

def build_chain():
    """
    LangChain RAG 체인 생성.
    - LLM: gemma4:e2b-it-q4_K_M (Ollama)
    - Embedding: nomic-embed-text (Ollama)
    - Retriever: Chroma MMR top-5
    """
    embeddings = OllamaEmbeddings(
        model=EMBED_MODEL,
        base_url=OLLAMA_URL,
    )

    vectorstore = Chroma(
        collection_name="security_knowledge",
        embedding_function=embeddings,
        persist_directory=CHROMA_PATH,
    )

    retriever = vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={"k": 5, "fetch_k": 20},
    )

    llm = OllamaLLM(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_URL,
        temperature=0.1,
    )

    prompt = PromptTemplate(
        input_variables=["context", "realtime", "question"],
        template=get_system_prompt(),
    )

    def format_docs(docs):
        return "\n\n".join(doc.page_content for doc in docs)

    chain = (
        {
            "context": (lambda x: x["question"]) | retriever | format_docs,
            "realtime": lambda x: x.get("realtime", "없음"),
            "question": lambda x: x["question"],
        }
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain


# ─────────────────────────────────────────────
# 실시간 컨텍스트 보강
# ─────────────────────────────────────────────

def _get_realtime_context(hours: int = 1) -> str:
    """최근 1시간 주요 보안 이벤트를 실시간으로 가져와 컨텍스트 문자열 생성."""
    lines = []

    try:
        ssh = loki_client.get_ssh_attacks(hours=hours)
        lines.append(f"[실시간] SSH 공격 시도: {len(ssh)}건")
    except Exception:
        pass

    try:
        bans = loki_client.get_fail2ban_bans(hours=hours)
        lines.append(f"[실시간] fail2ban 차단: {len(bans)}건")
    except Exception:
        pass

    try:
        alerts = loki_client.get_suricata_alerts(hours=hours)
        lines.append(f"[실시간] Suricata 알림: {len(alerts)}건")
    except Exception:
        pass

    try:
        wazuh = loki_client.get_wazuh_alerts(hours=hours)
        lines.append(f"[실시간] Wazuh High 알림: {len(wazuh)}건")
    except Exception:
        pass

    return "\n".join(lines) if lines else ""


# ─────────────────────────────────────────────
# 질의
# ─────────────────────────────────────────────

_chain = None


def query(question: str, context_hours: int = 24) -> str:
    """
    Chroma 벡터 검색 + Loki 실시간 데이터를 결합해 LLM 답변 생성.
    질문은 벡터 검색에만 사용되고, 실시간 컨텍스트는 별도 필드로 전달.
    """
    global _chain
    if _chain is None:
        _chain = build_chain()

    realtime = _get_realtime_context(hours=1)

    return _chain.invoke({
        "question": question,
        "realtime": realtime or "현재 조회된 실시간 데이터 없음",
    })


# ─────────────────────────────────────────────
# 직접 실행 시 테스트
# ─────────────────────────────────────────────

if __name__ == "__main__":
    from rich.console import Console

    console = Console()
    console.print("\n[bold cyan]RAG 체인 테스트[/bold cyan]\n")

    test_questions = [
        "최근 24시간 동안 가장 많이 공격한 IP는 무엇인가요?",
        "현재 서버의 보안 상태를 요약해 주세요.",
    ]

    for q in test_questions:
        console.print(f"[bold yellow]Q: {q}[/bold yellow]")
        with console.status("[bold green]분석 중..."):
            answer = query(q)
        console.print(f"[white]{answer}[/white]\n")
