# Testing Guide — SIEM-Trinity

## 현재 상태
저장소 전체에서 자동화된 테스트 파일이 발견되지 않음(`test_*.py`, `*.test.ts(x)`, `*.spec.ts(x)`, pytest/vitest 설정 없음). `04-ui/package.json`은 `lint`와 `typecheck`(`tsc -b --noEmit`) 스크립트만 정의하고, `CLAUDE.md`가 의도한 Vitest+RTL 스택은 아직 `test` 스크립트로 존재하지 않는다.

## 수동 검증 절차 ("사실 검증 가이드", README 기준)
```bash
curl http://<host>:2027/api/health/all
curl http://<host>:2027/api/system/host
curl -X POST http://<host>:2027/api/run
curl http://<host>:2027/api/alerts
```

## XDR 자동 대응 활성화 전 검증
자동 대응(자동 차단, 능동 대응 등)을 활성화하기 전 최소 1주간 드라이런 관찰 창을 두는 것이 권장 절차(`CLAUDE.md`).

## 권고
1. `04-ui`에 CLAUDE.md가 의도한 Vitest+RTL `test` 스크립트를 실제로 추가
2. `02-detection`의 4개 탐지기에 대한 pytest 스위트 도입(다른 저장소 siem-ai-detector와 공유 가능한 로직이므로 테스트도 공유 검토)
3. `docs/cutover-2026-05-22.md`에서 검증한 헬스체크 절차를 CI 스모크 테스트로 자동화
