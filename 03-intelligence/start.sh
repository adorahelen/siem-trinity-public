#!/usr/bin/env bash
# start.sh — SIEM Intelligence Layer 메뉴 진입점

set -euo pipefail

VENV_PATH="$HOME/.xdr/venv"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─────────────────────────────────────────────
# 가상환경 활성화
# ─────────────────────────────────────────────
activate_venv() {
    if [[ ! -d "$VENV_PATH" ]]; then
        echo "가상환경이 없습니다. 생성 중..."
        python3 -m venv "$VENV_PATH"
        # shellcheck source=/dev/null
        source "$VENV_PATH/bin/activate"
        pip install --quiet \
            langchain langchain-community langchain-ollama \
            chromadb requests rich streamlit python-dotenv
    else
        # shellcheck source=/dev/null
        source "$VENV_PATH/bin/activate"
    fi
}

# ─────────────────────────────────────────────
# Ollama 실행 확인
# ─────────────────────────────────────────────
check_ollama() {
    if ! curl -s http://localhost:11434 &>/dev/null; then
        echo "Ollama가 실행 중이지 않습니다. 시작합니다..."
        ollama serve &>/dev/null &
        sleep 2
        if ! curl -s http://localhost:11434 &>/dev/null; then
            echo "❌ Ollama 시작 실패. 직접 실행 후 다시 시도하세요: ollama serve"
            exit 1
        fi
    fi
}

# ─────────────────────────────────────────────
# Loki 연결 확인
# ─────────────────────────────────────────────
check_loki() {
    local loki_url
    loki_url=$(grep LOKI_URL "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "http://127.0.0.1:3100")
    if ! curl -s --max-time 3 "$loki_url/ready" &>/dev/null; then
        echo "⚠️  Loki에 연결할 수 없습니다 ($loki_url)"
        echo "   Tailscale VPN이 연결되어 있는지 확인하세요."
    fi
}

# ─────────────────────────────────────────────
# 메뉴
# ─────────────────────────────────────────────
print_menu() {
    echo ""
    echo "┌──────────────────────────────────────┐"
    echo "│  SIEM Intelligence Layer — 보안 분석  │"
    echo "├──────────────────────────────────────┤"
    echo "│  1) 로그 동기화 (레거시, Loki→Chroma) │"
    echo "│  2) 일간 보고서 생성                  │"
    echo "│  3) 주간 보고서 생성                  │"
    echo "│  4) CLI 대화형 분석 (RAG)             │"
    echo "│  5) Web UI (Streamlit)               │"
    echo "│  6) 컬렉션 상태 확인                  │"
    echo "│  7) 지식 문서 추가 (파일 경로 입력)    │"
    echo "│  0) 종료                              │"
    echo "└──────────────────────────────────────┘"
    echo -n "선택: "
}

# ─────────────────────────────────────────────
# 초기화
# ─────────────────────────────────────────────
cd "$SCRIPT_DIR"
activate_venv
check_ollama
check_loki

# ─────────────────────────────────────────────
# 메인 루프
# ─────────────────────────────────────────────
while true; do
    print_menu
    read -r choice

    case "$choice" in
        1)
            echo ""
            echo "⚠️  메뉴 1번은 Phase 1 레거시입니다."
            echo "   security_logs 컬렉션은 제거되었고 Agent가 Loki를 직접 쿼리합니다."
            echo "   보안 지식 문서 추가는 7번 메뉴를 사용하세요."
            ;;
        2)
            echo ""
            echo "일간 보고서를 생성합니다..."
            python report.py
            ;;
        3)
            echo ""
            echo "주간 보고서를 생성합니다..."
            python -c "
import report
from rich.console import Console
console = Console()
with console.status('[bold green]주간 보고서 생성 중...'):
    path = report.generate_weekly_report()
console.print(f'[bold green]✓ 저장 완료:[/bold green] {path}')
"
            ;;
        4)
            echo ""
            python cli.py
            ;;
        5)
            echo ""
            echo "Web UI를 시작합니다 (http://localhost:8501)"
            echo "종료하려면 Ctrl+C 를 누르세요."
            streamlit run app.py --server.headless true --browser.gatherUsageStats false
            ;;
        6)
            echo ""
            python -c "
import embedder
from rich.console import Console
console = Console()
stats = embedder.get_collection_stats()
console.print(f\"[bold]컬렉션:[/bold] {stats['collection']}\")
console.print(f\"[bold]총 청크 수:[/bold] {stats['total_chunks']}\")
console.print(f\"[bold]마지막 업데이트:[/bold] {stats['last_updated'] or '없음'}\")
console.print(f\"[bold]저장 경로:[/bold] {stats['path']}\")
"
            ;;
        7)
            echo ""
            echo -n "파일 경로를 입력하세요 (PDF/TXT/MD): "
            read -r doc_path
            if [[ -z "$doc_path" ]]; then
                echo "경로가 입력되지 않았습니다."
            elif [[ ! -f "$doc_path" ]]; then
                echo "파일을 찾을 수 없습니다: $doc_path"
            else
                echo -n "소스명 (비워두면 파일명 사용): "
                read -r source_name
                python -c "
import knowledge_loader, sys
from rich.console import Console
console = Console()
path = '$doc_path'
src = '${source_name}' or None
try:
    chunks = knowledge_loader.load_file(path)
    console.print(f'  청크 수: {len(chunks)}')
    with console.status('[bold green]임베딩 중...'):
        stored = knowledge_loader.embed_knowledge(chunks, src or __import__('pathlib').Path(path).stem)
    console.print(f'[bold green]✓ 저장 완료:[/bold green] {stored}청크')
except Exception as e:
    console.print(f'[bold red]오류:[/bold red] {e}')
"
            fi
            ;;
        0)
            echo "종료합니다."
            exit 0
            ;;
        *)
            echo "올바른 번호를 입력하세요."
            ;;
    esac

    echo ""
    echo "계속하려면 Enter를 누르세요..."
    read -r
done
