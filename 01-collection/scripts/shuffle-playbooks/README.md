# Shuffle workflow 템플릿

XDR 단계 5 (SHUFFLE_ENABLED=true) 진입 시 사용할 SOAR 플레이북 starter 템플릿.

## 파일

- `auto-ban-and-case.json` — `Webhook → fail2ban-client banip → Discord → TheHive case` (단계 5+6 묶음)
- `wazuh-critical-response.json` — `Wazuh critical webhook → active-response + Discord + TheHive case`

## 임포트

`scripts/bootstrap-xdr.sh` 의 `bootstrap_shuffle()` 가 자동으로:
1. Shuffle 첫 signup (admin 생성)
2. API key 추출
3. 본 디렉토리 `*.json` 을 `POST /api/v1/workflows` 로 import
4. 생성된 webhook URL 을 `.env` 의 `SHUFFLE_WEBHOOK_URL` 에 기록
5. 운영자가 Shuffle UI 에서 노드별 환경변수(Discord webhook, TheHive URL 등) 채움

## 한계 (수동 단계 잔존)

- 노드별 시크릿(Discord webhook URL, TheHive API key) 은 운영자가 Shuffle UI 에서 직접 입력해야 함
- 워크플로우 활성화 토글은 UI 에서 클릭 필요
- 본 JSON 스키마는 Shuffle 1.4.x 기준 — 다른 버전에선 import 실패 가능. 그때는 UI 에서 수동 작성.

## 참고

- 운영 문서: [`docs/xdr-step5-shuffle.md`](../../../docs/xdr-step5-shuffle.md)
- Shuffle API: https://shuffler.io/docs/API
