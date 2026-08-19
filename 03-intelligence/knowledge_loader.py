"""
knowledge_loader.py — 보안 지식 문서(PDF/TXT/MD) → ChromaDB security_knowledge
"""

import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

import chromadb
from dotenv import load_dotenv
from langchain_ollama import OllamaEmbeddings

load_dotenv()

CHROMA_PATH = os.getenv("CHROMA_PATH", os.path.expanduser("~/.xdr/chroma_db"))
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
COLLECTION_NAME = "security_knowledge"

# 청크 크기 (문자 수 기준)
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


# ─────────────────────────────────────────────
# 내부 유틸
# ─────────────────────────────────────────────

def _get_collection():
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"description": "KISA/MITRE/CVE/플레이북 보안 지식"},
    )


def _chunk_text(text: str) -> list[str]:
    """텍스트를 CHUNK_SIZE 단위로 분할 (CHUNK_OVERLAP 중첩)."""
    chunks = []
    start = 0
    text = text.strip()
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in chunks if len(c.strip()) > 50]


def _make_id(source_name: str, chunk_index: int, chunk_text: str) -> str:
    """청크 고유 ID 생성 (소스명 + 인덱스 + 내용 해시)."""
    h = hashlib.md5(chunk_text.encode()).hexdigest()[:8]
    return f"{source_name}_{chunk_index}_{h}"


def _embed(chunks: list[str]) -> list[list[float]]:
    """OllamaEmbeddings로 임베딩 생성."""
    embedder = OllamaEmbeddings(model=EMBED_MODEL, base_url=OLLAMA_URL)
    return embedder.embed_documents(chunks)


# ─────────────────────────────────────────────
# 파일 파싱
# ─────────────────────────────────────────────

def load_file(path: str) -> list[str]:
    """
    PDF / TXT / MD 파일을 파싱해 텍스트 청크 리스트로 반환.
    지원 형식: .pdf, .txt, .md
    """
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {path}")

    suffix = p.suffix.lower()

    if suffix == ".pdf":
        return _load_pdf(path)
    elif suffix in (".txt", ".md"):
        return _load_text(path)
    else:
        raise ValueError(f"지원하지 않는 파일 형식: {suffix} (pdf, txt, md만 지원)")


def _load_pdf(path: str) -> list[str]:
    try:
        import pypdf
    except ImportError:
        raise ImportError("PDF 처리를 위해 pypdf 설치 필요: pip install pypdf")

    reader = pypdf.PdfReader(path)
    full_text = ""
    for page in reader.pages:
        full_text += page.extract_text() + "\n"
    return _chunk_text(full_text)


def _load_text(path: str) -> list[str]:
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return _chunk_text(text)


def load_bytes(data: bytes, filename: str) -> list[str]:
    """
    바이트 데이터 (Streamlit 업로드용)를 파싱해 청크 리스트 반환.
    """
    suffix = Path(filename).suffix.lower()

    if suffix == ".pdf":
        import io
        try:
            import pypdf
        except ImportError:
            raise ImportError("PDF 처리를 위해 pypdf 설치 필요: pip install pypdf")
        reader = pypdf.PdfReader(io.BytesIO(data))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text() + "\n"
        return _chunk_text(full_text)

    elif suffix in (".txt", ".md"):
        text = data.decode("utf-8", errors="replace")
        return _chunk_text(text)

    else:
        raise ValueError(f"지원하지 않는 파일 형식: {suffix}")


# ─────────────────────────────────────────────
# ChromaDB 저장
# ─────────────────────────────────────────────

def embed_knowledge(chunks: list[str], source_name: str) -> int:
    """
    청크 리스트를 ChromaDB security_knowledge 컬렉션에 임베딩·저장.
    반환: 실제로 저장된 청크 수 (중복 제외)
    """
    if not chunks:
        return 0

    collection = _get_collection()

    # 기존에 같은 소스명으로 저장된 항목 삭제 (덮어쓰기)
    try:
        existing = collection.get(where={"source": source_name})
        if existing["ids"]:
            collection.delete(ids=existing["ids"])
    except Exception:
        pass

    embeddings = _embed(chunks)
    now = datetime.now(timezone.utc).isoformat()

    ids = [_make_id(source_name, i, c) for i, c in enumerate(chunks)]
    metadatas = [{"source": source_name, "chunk_index": i, "added_at": now} for i in range(len(chunks))]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
    )
    return len(chunks)


# ─────────────────────────────────────────────
# 조회 / 삭제
# ─────────────────────────────────────────────

def list_knowledge_sources() -> list[dict]:
    """
    등록된 지식 문서 목록 반환.
    반환: [{"source": ..., "chunks": ..., "added_at": ...}, ...]
    """
    collection = _get_collection()
    total = collection.count()
    if total == 0:
        return []

    # 전체 메타데이터 조회 (limit은 chromadb 최대치)
    result = collection.get(include=["metadatas"])
    sources: dict[str, dict] = {}
    for meta in result["metadatas"]:
        src = meta.get("source", "unknown")
        if src not in sources:
            sources[src] = {"source": src, "chunks": 0, "added_at": meta.get("added_at", "")}
        sources[src]["chunks"] += 1

    return sorted(sources.values(), key=lambda x: x["added_at"], reverse=True)


def delete_knowledge_source(source_name: str) -> bool:
    """
    특정 소스명으로 저장된 문서 전체 삭제.
    반환: 삭제 성공 여부
    """
    collection = _get_collection()
    try:
        existing = collection.get(where={"source": source_name})
        if not existing["ids"]:
            return False
        collection.delete(ids=existing["ids"])
        return True
    except Exception:
        return False


def search_knowledge(query: str, n_results: int = 5) -> list[str]:
    """
    쿼리와 가장 유사한 지식 청크 반환 (Agent 도구용).
    """
    collection = _get_collection()
    if collection.count() == 0:
        return ["등록된 보안 지식 문서가 없습니다."]

    embedder = OllamaEmbeddings(model=EMBED_MODEL, base_url=OLLAMA_URL)
    query_embedding = embedder.embed_query(query)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, collection.count()),
        include=["documents", "metadatas"],
    )

    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]

    output = []
    for doc, meta in zip(docs, metas):
        src = meta.get("source", "unknown")
        output.append(f"[출처: {src}]\n{doc}")
    return output


def get_collection_stats() -> dict:
    """ChromaDB security_knowledge 컬렉션 통계."""
    collection = _get_collection()
    sources = list_knowledge_sources()
    return {
        "collection": COLLECTION_NAME,
        "total_chunks": collection.count(),
        "source_count": len(sources),
        "sources": sources,
        "path": CHROMA_PATH,
    }


# ─────────────────────────────────────────────
# 직접 실행
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    from rich.console import Console
    from rich.table import Table

    console = Console()

    if len(sys.argv) < 2:
        # 통계 출력
        stats = get_collection_stats()
        console.print(f"[bold]컬렉션:[/bold] {stats['collection']}")
        console.print(f"[bold]총 청크:[/bold] {stats['total_chunks']}")
        console.print(f"[bold]소스 수:[/bold] {stats['source_count']}")

        if stats["sources"]:
            table = Table("소스", "청크 수", "등록일시")
            for s in stats["sources"]:
                table.add_row(s["source"], str(s["chunks"]), s["added_at"][:19])
            console.print(table)
        else:
            console.print("[yellow]등록된 문서가 없습니다.[/yellow]")
    else:
        # 파일 적재
        path = sys.argv[1]
        source_name = sys.argv[2] if len(sys.argv) > 2 else Path(path).stem
        console.print(f"[bold]파일 파싱 중:[/bold] {path}")
        chunks = load_file(path)
        console.print(f"  청크 수: {len(chunks)}")
        with console.status("[bold green]임베딩 및 저장 중..."):
            stored = embed_knowledge(chunks, source_name)
        console.print(f"[bold green]✓ 저장 완료:[/bold green] {stored}청크 → {COLLECTION_NAME}")
