# Verification Log — SIEM-Trinity

## 2026-05-21 — 옵저버빌리티 감사
옵저버빌리티 감사 보고서 작성(운영 호스트 실측 자산 정보 포함 — **공개판에서 제외**) — security-review.md에 정리된 다수의 미해결 항목 발견(fail2ban 비활성, TLS 없음, Tailscale 미설정 등).

## 2026-05-22 — 레거시 스택 통합(cutover)
`docs/cutover-2026-05-22.md`: `security-log-monitor`, `siem-ai-detector`, `siem-ai-analyst` 3개 레거시 저장소/스택을 모노레포로 통합, 기존 Docker 볼륨을 compose 프로젝트명 재사용으로 **데이터 무손실** 이전. 해결한 이슈: 서브디렉터리 간 `.env` 심볼릭 링크 전파(compose 변수 보간이 동일 디렉터리 `.env`만 읽는 문제), 포트 충돌(Ollama 11434→11435). Loki/Grafana/Prometheus 헬스 + 대시보드 보존 + BFF 프록시 라우트를 검증 후 "cut-over 완전 완료" 결론, restic 백업을 롤백 안전망으로 확보.

## 체크포인트/롤백 이력
git 태그: `checkpoint/monorepo-v1`, `checkpoint/ui-cleanup-done` 등 — 롤백 지점으로 유지.

## 디스크 정리 이벤트
MISP/Shuffle/TheHive 컨테이너 중지로 디스크 사용률 90%→57% 감소(Issue #71에 추적).

## 현재 상태 (2026-07-24 기준)
`chore/cutover-2026-05-22-merge-legacy-stacks` 브랜치에서 작업 중이던 내역(빌드 산출물 `04-ui/tsconfig.tsbuildinfo` 변경)을 이번 문서 작업을 위해 stash로 잠시 보관하고 main으로 전환했다 — 작업 완료 후 해당 피처 브랜치에 복원 예정. security-review.md의 미해결 항목(fail2ban 비활성 등)은 다음 검증 지점으로 남아있다.
