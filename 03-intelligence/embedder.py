"""
embedder.py — 로그 청크 → ChromaDB 벡터 저장 모듈
"""

import hashlib
import os
from datetime import datetime, timezone

import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv

import loki_client

load_dotenv()

CHROMA_PATH = os.getenv("CHROMA_PATH", "/Users/user/.xdr/chroma_db")
EMBED_MODEL  = os.getenv("EMBED_MODEL", "nomic-embed-text")
OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434")

# 청크당 로그 라인 수 (nomic-embed-text 컨텍스트 제한 고려)
CHUNK_SIZE = 5

# sync 대상 소스
SYNC_SOURCES = [
    "auth",
    "fail2ban",
    "suricata",
    "wazuh",
    "zeek_conn",
    "zeek_dns",
    "zeek_notice",
    "kern",
    "nginx_access_enriched",
]


# ─────────────────────────────────────────────
# ChromaDB 클라이언트 초기화
# ─────────────────────────────────────────────

def _get_client() -> chromadb.PersistentClient:
    os.makedirs(CHROMA_PATH, exist_ok=True)
    return chromadb.PersistentClient(path=CHROMA_PATH)


def _get_embed_fn():
    return embedding_functions.OllamaEmbeddingFunction(
        url=f"{OLLAMA_URL}/api/embeddings",
        model_name=EMBED_MODEL,
    )


def _get_collection(name: str = "security_logs"):
    client = _get_client()
    return client.get_or_create_collection(
        name=name,
        embedding_function=_get_embed_fn(),
        metadata={"hnsw:space": "cosine"},
    )


# ─────────────────────────────────────────────
# 청크 생성
# ─────────────────────────────────────────────

def chunk_logs(logs: list[dict], chunk_size: int = CHUNK_SIZE) -> list[str]:
    """
    로그 엔트리 리스트를 chunk_size 단위로 묶어 텍스트 청크 리스트 반환.
    각 청크: "timestamp [job] line\\n..." 형식
    개별 라인은 300자로 잘라 임베딩 컨텍스트 초과 방지.
    """
    MAX_LINE = 300
    chunks = []
    for i in range(0, len(logs), chunk_size):
        group = logs[i : i + chunk_size]
        lines = []
        for entry in group:
            ts  = entry.get("timestamp", "")
            job = entry.get("labels", {}).get("job", "unknown")
            line = entry.get("line", "").strip()[:MAX_LINE]
            lines.append(f"{ts} [{job}] {line}")
        chunks.append("\n".join(lines))
    return chunks


# ─────────────────────────────────────────────
# 저장
# ─────────────────────────────────────────────

def embed_and_store(
    chunks: list[str],
    collection_name: str = "security_logs",
) -> int:
    """
    청크 리스트를 ChromaDB에 임베딩 후 저장.
    SHA256 해시를 ID로 사용해 중복 저장 방지.
    반환: 새로 저장된 청크 수
    """
    if not chunks:
        return 0

    collection = _get_collection(collection_name)

    ids       = []
    documents = []
    stored_at = datetime.now(timezone.utc).isoformat()

    for chunk in chunks:
        chunk_id = hashlib.sha256(chunk.encode()).hexdigest()
        ids.append(chunk_id)
        documents.append(chunk)

    # 이미 존재하는 ID 제외
    existing = set(collection.get(ids=ids)["ids"])
    new_ids  = [i for i in ids if i not in existing]
    new_docs = [documents[ids.index(i)] for i in new_ids]

    if new_docs:
        # 대량 데이터는 배치로 나눠서 저장 (타임아웃 방지)
        BATCH = 50
        for start in range(0, len(new_docs), BATCH):
            batch_ids  = new_ids[start : start + BATCH]
            batch_docs = new_docs[start : start + BATCH]
            collection.add(
                ids=batch_ids,
                documents=batch_docs,
                metadatas=[{"stored_at": stored_at}] * len(batch_docs),
            )

    return len(new_docs)


# ─────────────────────────────────────────────
# 전체 동기화
# ─────────────────────────────────────────────

def sync_recent_logs(hours: int = 24) -> dict:
    """
    모든 보안 소스에서 로그를 가져와 ChromaDB에 저장.
    반환: {source: {"fetched": N, "stored": N}, ...}
    """
    results = {}

    fetch_map = {
        "auth":                 lambda: loki_client.get_ssh_attacks(hours),
        "fail2ban":             lambda: loki_client.get_fail2ban_bans(hours),
        "suricata":             lambda: loki_client.get_suricata_alerts(hours),
        "wazuh":                lambda: loki_client.get_wazuh_alerts(hours),
        "zeek_conn":            lambda: loki_client.query_range(
                                    '{job="zeek_conn"}', f"now-{hours}h", limit=3000),
        "zeek_dns":             lambda: loki_client.get_zeek_dns(hours),
        "zeek_notice":          lambda: loki_client.query_range(
                                    '{job="zeek_notice"}', f"now-{hours}h", limit=2000),
        "kern":                 lambda: loki_client.get_kr_blocks(hours),
        "nginx_access_enriched": lambda: loki_client.query_range(
                                    '{job="nginx_access_enriched"}', f"now-{hours}h", limit=3000),
    }

    for source in SYNC_SOURCES:
        try:
            logs   = fetch_map[source]()
            chunks = chunk_logs(logs)
            stored = embed_and_store(chunks)
            results[source] = {"fetched": len(logs), "stored": stored}
        except Exception as e:
            results[source] = {"fetched": 0, "stored": 0, "error": str(e)}

    return results


# ─────────────────────────────────────────────
# 컬렉션 통계
# ─────────────────────────────────────────────

def get_collection_stats(collection_name: str = "security_logs") -> dict:
    """ChromaDB 컬렉션 현황 반환."""
    collection = _get_collection(collection_name)
    count = collection.count()

    # 최근 저장 시각
    try:
        sample = collection.get(limit=1, include=["metadatas"])
        last_updated = (
            sample["metadatas"][0].get("stored_at") if sample["metadatas"] else None
        )
    except Exception:
        last_updated = None

    return {
        "total_chunks": count,
        "last_updated": last_updated,
        "collection": collection_name,
        "path": CHROMA_PATH,
    }


# ─────────────────────────────────────────────
# 직접 실행 시 동기화 테스트
# ─────────────────────────────────────────────

if __name__ == "__main__":
    from rich.console import Console
    from rich.table import Table

    console = Console()
    console.print("\n[bold cyan]로그 동기화 시작 (최근 24시간)[/bold cyan]\n")

    with console.status("[bold green]Loki에서 로그 수집 중..."):
        results = sync_recent_logs(hours=24)

    table = Table(title="동기화 결과", show_header=True)
    table.add_column("소스", style="cyan")
    table.add_column("수집", justify="right")
    table.add_column("저장(신규)", justify="right")
    table.add_column("상태", justify="center")

    for source, info in results.items():
        error = info.get("error")
        status = "[red]오류[/red]" if error else "[green]OK[/green]"
        table.add_row(
            source,
            str(info["fetched"]),
            str(info["stored"]),
            status,
        )
        if error:
            console.print(f"  [red]{source} 오류: {error}[/red]")

    console.print(table)

    stats = get_collection_stats()
    console.print(f"\n[bold]컬렉션 총 청크 수:[/bold] {stats['total_chunks']}")
    console.print(f"[bold]마지막 업데이트:[/bold]  {stats['last_updated']}")
