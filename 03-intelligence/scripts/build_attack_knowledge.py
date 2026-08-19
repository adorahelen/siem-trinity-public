"""
MITRE ATT&CK Enterprise STIX → 기술별 markdown chunk → ChromaDB security_knowledge.

knowledge_loader.embed_knowledge() 를 그대로 재사용해 임베딩.

실행:
    python build_attack_knowledge.py
    python build_attack_knowledge.py --stix /path/to/enterprise-attack.json

생성되는 source_name 패턴:
    attack/T1110         (technique)
    attack/T1110.001     (sub-technique)
한 technique 당 1개의 markdown 청크(필요시 _chunk_text 로 추가 분할).
"""
import argparse
import json
import sys
from pathlib import Path

# 상위 디렉토리 (03-intelligence) 를 import path 에 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from knowledge_loader import embed_knowledge  # noqa: E402

DEFAULT_STIX = Path(__file__).resolve().parents[2] / "datasets" / "attack" / "enterprise-attack.json"


def _ext_id(obj: dict) -> str:
    for ref in obj.get("external_references", []) or []:
        if ref.get("source_name") == "mitre-attack" and ref.get("external_id"):
            return ref["external_id"]
    return ""


def _tactic_names(obj: dict) -> list[str]:
    return [p["phase_name"] for p in obj.get("kill_chain_phases", [])
            if p.get("kill_chain_name") == "mitre-attack"]


def _build_chunk(tech: dict) -> tuple[str, str]:
    """(source_name, markdown_text) 반환."""
    tid = _ext_id(tech)
    name = tech.get("name", "")
    desc = tech.get("description", "")
    tactics = _tactic_names(tech)
    platforms = tech.get("x_mitre_platforms", []) or []
    data_sources = tech.get("x_mitre_data_sources", []) or []
    detection = tech.get("x_mitre_detection", "") or ""

    md = [
        f"# {tid} — {name}",
        "",
        f"**Tactics**: {', '.join(tactics) or 'n/a'}",
        f"**Platforms**: {', '.join(platforms) or 'n/a'}",
        f"**Data Sources**: {', '.join(data_sources) or 'n/a'}",
        "",
        "## 설명",
        desc.strip(),
    ]
    if detection.strip():
        md += ["", "## 탐지", detection.strip()]
    return f"attack/{tid}", "\n".join(md)


def main(stix_path: Path) -> None:
    print(f"[+] Loading STIX bundle: {stix_path}", file=sys.stderr)
    bundle = json.loads(stix_path.read_text(encoding="utf-8"))

    techs = [
        o for o in bundle["objects"]
        if o.get("type") == "attack-pattern"
        and not o.get("x_mitre_deprecated")
        and not o.get("revoked")
    ]
    print(f"[+] {len(techs)} active techniques to embed", file=sys.stderr)

    total_chunks = 0
    for i, tech in enumerate(techs, 1):
        source_name, md = _build_chunk(tech)
        if not _ext_id(tech):
            continue
        stored = embed_knowledge([md], source_name)
        total_chunks += stored
        if i % 50 == 0:
            print(f"  {i}/{len(techs)} … (chunks so far: {total_chunks})", file=sys.stderr)

    print(f"[✓] Done — {total_chunks} chunks across {len(techs)} techniques", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stix", type=Path, default=DEFAULT_STIX,
                        help=f"STIX bundle path (default: {DEFAULT_STIX})")
    args = parser.parse_args()
    if not args.stix.exists():
        sys.exit(f"STIX 번들 없음: {args.stix}")
    main(args.stix)
