"""
app.py — SIEM Intelligence Layer Streamlit Web UI
"""

import streamlit as st
from pathlib import Path

import loki_client
import embedder
import rag_chain
import knowledge_loader

st.set_page_config(
    page_title="SIEM Intelligence Layer",
    page_icon="🛡️",
    layout="wide",
)

st.title("🛡️ SIEM Intelligence Layer — 보안 로그 AI 분석")

# ─────────────────────────────────────────────
# 사이드바
# ─────────────────────────────────────────────
with st.sidebar:
    st.header("설정")

    hours = st.slider("분석 기간 (시간)", min_value=1, max_value=168, value=24, step=1)

    st.divider()

    if st.button("🔄 로그 동기화", use_container_width=True):
        with st.spinner("Loki에서 로그 수집 중..."):
            results = embedder.sync_recent_logs(hours=hours)
        st.success("동기화 완료")
        for src, info in results.items():
            if info.get("error"):
                st.error(f"{src}: {info['error']}")
            else:
                st.write(f"- {src}: {info['fetched']}건 수집 / {info['stored']}건 저장")

    st.divider()

    st.subheader("컬렉션 상태")
    if st.button("통계 조회", use_container_width=True):
        stats = embedder.get_collection_stats()
        st.metric("총 청크 수", stats["total_chunks"])
        st.write(f"마지막 업데이트: {stats['last_updated'] or '없음'}")


# ─────────────────────────────────────────────
# 메인 탭
# ─────────────────────────────────────────────
tab_chat, tab_agent, tab_dashboard, tab_report, tab_knowledge = st.tabs([
    "💬 RAG 분석", "🤖 Agent 분석", "📊 현황", "📄 보고서", "📚 지식 문서"
])

# ── RAG 채팅
with tab_chat:
    if "messages" not in st.session_state:
        st.session_state.messages = []

    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.write(msg["content"])

    question = st.chat_input("보안 로그에 대해 질문하세요...")

    if question:
        st.session_state.messages.append({"role": "user", "content": question})
        with st.chat_message("user"):
            st.write(question)

        with st.chat_message("assistant"):
            with st.spinner("분석 중..."):
                try:
                    answer = rag_chain.query(question, context_hours=hours)
                except Exception as e:
                    answer = f"오류: {e}"
            st.write(answer)
            st.session_state.messages.append({"role": "assistant", "content": answer})

# ── Agent 분석
with tab_agent:
    st.caption("Agent가 Loki를 직접 쿼리하고 보안 지식 DB를 참조해 답변합니다.")

    if "agent_messages" not in st.session_state:
        st.session_state.agent_messages = []

    for msg in st.session_state.agent_messages:
        with st.chat_message(msg["role"]):
            st.write(msg["content"])

    agent_question = st.chat_input("보안 위협에 대해 질문하세요...", key="agent_input")

    if agent_question:
        st.session_state.agent_messages.append({"role": "user", "content": agent_question})
        with st.chat_message("user"):
            st.write(agent_question)

        with st.chat_message("assistant"):
            with st.spinner("Agent 분석 중... (Loki 쿼리 + 지식 검색)"):
                try:
                    import agent as ag
                    answer = ag.run(agent_question)
                except Exception as e:
                    answer = f"오류: {e}"
            st.write(answer)
            st.session_state.agent_messages.append({"role": "assistant", "content": answer})

# ── 현황 대시보드
with tab_dashboard:
    if st.button("현황 새로고침"):
        st.rerun()

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        try:
            ssh = loki_client.get_ssh_attacks(hours=hours)
            st.metric("SSH 공격 시도", f"{len(ssh)}건")
        except Exception:
            st.metric("SSH 공격 시도", "조회 실패")

    with col2:
        try:
            bans = loki_client.get_fail2ban_bans(hours=hours)
            st.metric("fail2ban 차단", f"{len(bans)}건")
        except Exception:
            st.metric("fail2ban 차단", "조회 실패")

    with col3:
        try:
            alerts = loki_client.get_suricata_alerts(hours=hours)
            st.metric("Suricata 알림", f"{len(alerts)}건")
        except Exception:
            st.metric("Suricata 알림", "조회 실패")

    with col4:
        try:
            wazuh = loki_client.get_wazuh_alerts(hours=hours)
            st.metric("Wazuh High 알림", f"{len(wazuh)}건")
        except Exception:
            st.metric("Wazuh High 알림", "조회 실패")

    st.divider()
    st.subheader("상위 공격 IP")
    try:
        top_ips = loki_client.get_top_attack_ips(hours=hours, limit=10)
        if top_ips:
            st.table(top_ips)
        else:
            st.info("공격 IP 데이터가 없습니다.")
    except Exception as e:
        st.error(f"조회 실패: {e}")

# ── 보고서 생성
with tab_report:
    col_d, col_w = st.columns(2)

    with col_d:
        st.subheader("일간 보고서")
        report_date = st.date_input("날짜", value=None, key="daily_date")
        if st.button("일간 보고서 생성", use_container_width=True):
            import report as rpt
            date_str = report_date.strftime("%Y-%m-%d") if report_date else "today"
            with st.spinner("생성 중..."):
                path = rpt.generate_daily_report(date=date_str)
            st.success(f"저장 완료: {path}")
            with open(path, encoding="utf-8") as f:
                st.download_button("다운로드", f.read(), file_name=path.split("/")[-1])

    with col_w:
        st.subheader("주간 보고서")
        week_offset = st.number_input("주 오프셋 (0=이번 주)", min_value=0, max_value=52, value=0)
        if st.button("주간 보고서 생성", use_container_width=True):
            import report as rpt
            with st.spinner("생성 중..."):
                path = rpt.generate_weekly_report(week_offset=int(week_offset))
            st.success(f"저장 완료: {path}")
            with open(path, encoding="utf-8") as f:
                st.download_button("다운로드", f.read(), file_name=path.split("/")[-1])

# ── 지식 문서 관리
with tab_knowledge:
    st.subheader("보안 지식 문서 업로드")
    st.caption("KISA 가이드라인, MITRE ATT&CK, CVE 설명, 대응 플레이북 등을 등록합니다.")

    uploaded = st.file_uploader(
        "파일을 드래그 앤 드롭 또는 클릭하여 선택",
        type=["pdf", "txt", "md"],
        accept_multiple_files=True,
    )

    source_name_input = st.text_input(
        "문서 소스명 (비워두면 파일명 사용)",
        placeholder="예: KISA_APT_대응가이드_2024",
    )

    if st.button("📥 등록", use_container_width=True, disabled=not uploaded):
        for f in uploaded:
            src = source_name_input.strip() or Path(f.name).stem
            if len(uploaded) > 1:
                src = Path(f.name).stem  # 다중 파일은 파일명 사용
            with st.spinner(f"{f.name} 처리 중..."):
                try:
                    chunks = knowledge_loader.load_bytes(f.read(), f.name)
                    stored = knowledge_loader.embed_knowledge(chunks, src)
                    st.success(f"✓ {f.name} — {stored}청크 저장 (소스: {src})")
                except Exception as e:
                    st.error(f"✗ {f.name}: {e}")

    st.divider()
    st.subheader("등록된 문서 목록")

    if st.button("🔄 새로고침", key="knowledge_refresh"):
        st.rerun()

    try:
        stats = knowledge_loader.get_collection_stats()
        st.metric("총 청크 수", stats["total_chunks"])
        st.metric("문서 수", stats["source_count"])

        sources = stats["sources"]
        if sources:
            for s in sources:
                col_s, col_c, col_d, col_del = st.columns([3, 1, 2, 1])
                col_s.write(s["source"])
                col_c.write(f"{s['chunks']}청크")
                col_d.write(s["added_at"][:19] if s["added_at"] else "")
                if col_del.button("삭제", key=f"del_{s['source']}"):
                    ok = knowledge_loader.delete_knowledge_source(s["source"])
                    if ok:
                        st.success(f"{s['source']} 삭제 완료")
                        st.rerun()
        else:
            st.info("등록된 문서가 없습니다. 위에서 파일을 업로드하세요.")
    except Exception as e:
        st.error(f"조회 실패: {e}")
