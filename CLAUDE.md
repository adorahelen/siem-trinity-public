# CLAUDE.md — 작업 규율 (전역)

## 1. 네 가지 원칙 (Karpathy)
1. **Surface assumptions.** 모호하면 추측하지 말고 묻거나 가능한 해석을 나열한다. 혼란스러우면 멈춰서 무엇이 불명확한지 이름 붙인다.
2. **Minimize code.** 실제 문제를 푸는 가장 작은 변경만. 미래 시나리오를 위한 추상화·플래그·헬퍼 금지. 시니어가 보면 과한가? → 더 줄여라.
3. **Surgical edits.** 건드려야만 하는 곳만 건드린다. 내가 만든 흔적만 정리하고, 한 PR/커밋엔 한 가지 문제만 담는다.
4. **Goal-driven execution.** 명령이 아닌 성공 기준을 정의하고, 충족될 때까지 검증 루프를 돌린다. 증거 없이 "끝났다"고 선언하지 않는다.

## 2. 인간 파트너십
- **돌이키기 어려운 작업은 사전 확인.** 배포/푸시/외부 전송/대량 삭제/마이그레이션은 전체 diff를 보여주고 명시적 승인을 받는다.
- **권한은 매번 그 범위에 한정**된다. 한 번 승인받았다고 다음에도 자동 승인된 것이 아니다.
- **모르면 모른다고 말한다.** 파일 경로·함수·API·라이브러리 동작을 추측해서 단정하지 않는다. 메모리에서 인용하기 전 현재 코드에서 한 번 더 확인한다.

## 3. 메모리 정책
auto-memory 시스템(`~/.claude/projects/<project>/memory/`)을 단일 소스로 사용한다. 프로젝트 루트에 별도 `MEMORY.md`를 만들지 않는다.

---

## 4. Git 정책 (SIEM-Trinity)

### 4.1 단일 모노레포 원칙
- `SIEM-Trinity` 1개 repo로 운영. `01-collection / 02-detection / 03-intelligence / 04-ui` 는 서브디렉토리이지 별도 repo가 아니다.
- 구(舊) repo (`security-log-monitor`, `siem-ai-detector`, `siem-ai-analyst`, `TrinitySOC`) 는 legacy/archive. 신규 작업은 모노레포에서만.
- `04-ui` 는 `TrinitySOC` 리포의 git subtree 머지 결과 (모든 커밋 보존). 기존 TrinitySOC 리포는 archive 로 유지.
- `SIEM-Trinity-public` 은 sanitize된 공개 스냅샷. 양방향이 아닌 **private → public 단방향** 흐름.

### 4.2 브랜치 전략
- `main` : 항상 배포 가능한 안정 상태. 직접 push 금지, PR로만.
- 작업 브랜치 prefix:
  - `xdr/stepN-<slug>` : XDR epic(#4) 6단계 작업
  - `feat/<slug>` : XDR 외 신규 기능
  - `fix/<slug>` : 버그 수정
  - `docs/<slug>` / `chore/<slug>`
- 한 브랜치 = 한 PR = 한 가지 문제 (§1.3 Surgical edits).

### 4.3 개발-테스트 흐름
```
[로컬 WSL]  코드 작성 · 커밋 · push
   ↓
[GitHub]    PR 생성 (XDR 단계 epic #4 체크박스 갱신)
   ↓
[232 서버]  git pull · 호스트 의존 검증 (Wazuh agent, auditd, fail2ban-client)
   ↓
검증 통과 → PR 머지 → main
```
- **로컬에서는 코드만, 232에서는 테스트만.** 232에서 직접 코드 수정 금지 (history 분기 방지).
- 232는 `kangminlog` 운영 호스트의 대역(代役). XDR 단계마다 232에서 dry-run 후 운영 적용.

### 4.4 검증 게이트 (PR 머지 조건)
1. 해당 XDR 단계의 epic 체크박스에 명시된 "검증" 명령이 232에서 성공
2. 운영 영향 있는 변경 (자동 차단, active-response) 은 **dry-run/`*_ENABLED=false` 기본값** 필수
3. 화이트리스트 (Tailscale 100.x, 사용자 IP, 본인 도메인 DNS) 누락 여부 확인

---

## 5. 개발 진행 방식

### 5.1 단계별 작업 (Issue #4 epic 따름)
현재 위치: **단계 1 완료 (PR #24 머지) → 단계 2 진입 직전.**

각 단계는 다음 사이클로:
1. epic의 해당 단계 체크박스 읽기 → 작업 범위 고정
2. `xdr/stepN-<slug>` 브랜치 생성
3. 최소 코드 변경 (§1.2 Minimize code) — 단계 경계 넘는 작업은 다음 브랜치로 미룸
4. 232에서 검증 → 증거(로그·명령 출력) 를 PR 본문에 첨부
5. PR 머지 → epic 체크박스 갱신 → 다음 단계

### 5.2 단계 의존성
```
1 (Endpoint 가시성)  ──┐
                       ├─→ 3 (active-response)
2 (auto-ban, 첫 R)  ───┤
                       └─→ 5 (SOAR) ──→ 6 (Case mgmt)
4 (MISP, 독립)
```
2와 4는 1에 무관하게 병렬 가능. 단, 3·5·6은 선행 단계 검증 후 진입.

### 5.3 안전장치
- 단계 2 진입 시 `AUTO_BAN_ENABLED=false` 기본값, dry-run 로그만 1주일 관찰 후 활성화
- 단계 3 active-response 는 Tailscale 대역 화이트리스트 검증 없이는 머지 금지
- 자동화가 운영자(사용자 본인)를 차단할 위험을 항상 1순위 리스크로 둔다

---

## 6. 최종 XDR의 모습 (목표 아키텍처)

**위치는 그대로 `SIEM-Trinity` 모노레포 안.** 새 repo·새 디렉토리 분리 없음. 단계 4~6에서 추가되는 컨테이너(MISP, Shuffle, TheHive)는 `01-collection/docker-compose.yml` 에 통합 — Wazuh manager와 같은 컴포즈 스택으로 운영.

### 6.1 완성 시 데이터 흐름
```
[Endpoint]  Wazuh agent + auditd ─┐
[Network]   Zeek + Suricata ──────┤
[App]       Nginx/ModSecurity ────┼─→ Promtail → Loki
[Host]      ufw/fail2ban/journal ─┘                │
                                                   ↓
                          02-detection (ip_risk_scorer, dga, beacon, flow)
                                                   │
                          ┌────────────────────────┼────────────────────────┐
                          ↓                        ↓                        ↓
                  fail2ban-client          Wazuh active-response       MISP IOC 매칭
                  (auto-ban, 단계 2)       (firewall-drop, 단계 3)     (단계 4)
                          │                        │                        │
                          └────────────────────────┼────────────────────────┘
                                                   ↓
                                       Shuffle SOAR playbook (단계 5)
                                                   ↓
                                       TheHive 케이스 자동 생성 (단계 6)
                                                   ↓
                                  03-intelligence LLM이 케이스 코멘트 작성
                                                   ↓
                                          Discord 운영자 알림
```

### 6.2 디렉토리 최종 형태 (확정)
```
SIEM-Trinity/
├── 01-collection/        # 수집 + 인프라 (Wazuh, MISP, Shuffle, TheHive 컴포즈)
│   ├── docker-compose.yml   ← MISP/Shuffle/TheHive 서비스 추가
│   └── scripts/setup-*.sh   ← agent/auditd/active-response 설치
├── 02-detection/         # 탐지 + BFF (auto_ban, active-response 트리거, FastAPI 25+ 엔드포인트)
├── 03-intelligence/      # LLM 분석 + TheHive 케이스 코멘트 작성 (Ollama gemma4 + ChromaDB)
├── 04-ui/                # TrinitySOC — 통합 운영자 콘솔 (React 18 + ECharts + 위젯 CRUD)
└── docs/xdr-stepN-*.md   # 단계별 설치·운영 가이드
```

### 6.3 성공 지표 (epic 인용)
- 6단계 모두 완료
- README "자동 대응 체인" 표가 "수동 검토만" → "자동 격리·차단·케이스 생성"
- 사람 개입 없이 1개 이상의 end-to-end 시나리오 자동화

### 6.4 의식적으로 안 하는 것
- OpenCTI 도입 (MISP 대비 너무 무거움 — epic 명시)
- 별도 XDR repo 분리 (모노레포 응집성 손실)
- 단계 건너뛰기 (2 없이 3, 5 없이 6 진입 금지)
