"""
cli.py — SIEM Intelligence Layer 대화형 CLI
모드 선택: RAG (ChromaDB 기반) / Agent (Loki 직접 쿼리)
"""

import sys

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.text import Text

console = Console()

HISTORY_LIMIT = 20


def print_banner(mode: str):
    banner = Text()
    banner.append("SIEM Intelligence Layer", style="bold cyan")
    if mode == "agent":
        banner.append(" — Agent 모드", style="bold yellow")
        subtitle = "Loki 직접 쿼리 + 보안 지식 RAG | 종료: exit 또는 Ctrl+C"
    else:
        banner.append(" — RAG 모드", style="bold green")
        subtitle = "ChromaDB 기반 분석 | 종료: exit 또는 Ctrl+C"
    console.print(Panel(banner, subtitle=subtitle, style="cyan"))


def select_mode() -> str:
    """시작 시 모드 선택."""
    console.print()
    console.print("[bold]분석 모드를 선택하세요:[/bold]")
    console.print("  [bold yellow]1[/bold yellow]) Agent 모드  — Loki 직접 쿼리 + 보안 지식 검색 [bold](권장)[/bold]")
    console.print("  [bold green]2[/bold green]) RAG 모드    — ChromaDB 스냅샷 기반")
    console.print()

    while True:
        choice = Prompt.ask("선택", choices=["1", "2"], default="1")
        if choice == "1":
            return "agent"
        return "rag"


def run_agent_mode():
    """Agent 모드: LangGraph ReAct Agent로 Loki 직접 쿼리."""
    console.print("[dim]Agent 초기화 중...[/dim]")
    try:
        import agent as ag
        ag.build_agent()  # 초기화 확인
    except Exception as e:
        console.print(f"[bold red]Agent 초기화 실패: {e}[/bold red]")
        sys.exit(1)

    console.print("[green]Agent 준비 완료. 자연어로 질문하세요.[/green]")
    console.print("[dim]예) 최근 24시간 SSH 공격 요약 / 오늘 Suricata Critical 알림 알려줘[/dim]\n")

    while True:
        try:
            question = Prompt.ask("[bold yellow]질문[/bold yellow]").strip()
        except (KeyboardInterrupt, EOFError):
            console.print("\n[dim]종료합니다.[/dim]")
            break

        if not question:
            continue
        if question.lower() in ("exit", "quit", "종료"):
            console.print("[dim]종료합니다.[/dim]")
            break

        with console.status("[bold yellow]Agent 분석 중... (Loki 쿼리 + 지식 검색)[/bold yellow]", spinner="dots"):
            try:
                answer = ag.run(question)
            except Exception as e:
                answer = f"오류 발생: {e}"

        console.print()
        console.print(Panel(answer, title="[bold yellow]Agent 분석 결과[/bold yellow]", style="yellow"))
        console.print()


def run_rag_mode():
    """RAG 모드: ChromaDB 기반 기존 방식."""
    import rag_chain

    console.print("[dim]RAG 체인 초기화 중...[/dim]")
    try:
        chain = rag_chain.build_chain()
    except Exception as e:
        console.print(f"[bold red]체인 초기화 실패: {e}[/bold red]")
        console.print("[yellow]ChromaDB에 데이터가 없으면 먼저 로그를 동기화하세요 (메뉴 1번)[/yellow]")
        sys.exit(1)

    console.print("[green]RAG 준비 완료. 질문을 입력하세요.[/green]\n")

    history: list[dict] = []

    while True:
        try:
            question = Prompt.ask("[bold green]질문[/bold green]").strip()
        except (KeyboardInterrupt, EOFError):
            console.print("\n[dim]종료합니다.[/dim]")
            break

        if not question:
            continue
        if question.lower() in ("exit", "quit", "종료"):
            console.print("[dim]종료합니다.[/dim]")
            break

        history.append({"role": "user", "content": question})

        with console.status("[bold green]분석 중...[/bold green]", spinner="dots"):
            try:
                answer = rag_chain.query(question)
            except Exception as e:
                answer = f"오류 발생: {e}"

        console.print()
        console.print(Panel(answer, title="[bold green]RAG 분석 결과[/bold green]", style="green"))
        console.print()

        history.append({"role": "assistant", "content": answer})

        if len(history) > HISTORY_LIMIT * 2:
            history = history[-(HISTORY_LIMIT * 2):]


def run():
    # 커맨드라인 인수로 모드 바로 지정 가능
    # python cli.py agent  또는  python cli.py rag
    if len(sys.argv) > 1 and sys.argv[1] in ("agent", "rag"):
        mode = sys.argv[1]
    else:
        mode = select_mode()

    print_banner(mode)

    if mode == "agent":
        run_agent_mode()
    else:
        run_rag_mode()


if __name__ == "__main__":
    run()
