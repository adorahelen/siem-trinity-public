# CLAUDE.md — TrinitySOC 작업 규율

## 1. 정체성

TrinitySOC 는 [`SIEM-Trinity`](https://github.com/adorahelen/siem-trinity-public) 의 **통합 운영자 콘솔(SOC Portal)** 이다.
SIEM-Trinity 자체는 백엔드·데이터·탐지·자동화 엔진. TrinitySOC 는 그 위에 얹는 **풀 자체 UI (Option C)** — 6개 분리된 3rd-party UI 를 하나의 React 앱으로 흡수한다.

- SIEM-Trinity 의 코드·로직은 **건드리지 않는다.** 필요한 데이터는 API 추가로 가져온다.
- TrinitySOC 는 순수 **프런트엔드 + 얇은 BFF 프록시** 로만 존재한다.

## 2. 네 가지 원칙 (Karpathy — 전역 CLAUDE.md 계승)

1. **Surface assumptions.** UI 사양·디자인 의도가 모호하면 추측 말고 묻는다. "어느 페이지에 어떤 차트인지" 가 불분명한 채로 코드 쓰지 않는다.
2. **Minimize code.** 한 페이지에는 한 가지 일만. 헬퍼·HOC·추상 컴포넌트는 **3번 반복된 뒤에야** 만든다.
3. **Surgical edits.** 디자인 토큰·공통 컴포넌트 외에는 페이지별 파일만 건드린다. 한 PR = 한 페이지 or 한 컴포넌트.
4. **Goal-driven execution.** "보기 좋다" 가 아니라 **운영자가 실제로 쓸 수 있나** 가 성공 기준. 데이터 0건 상태도 의도적으로 디자인한다.

## 3. 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| 빌드 | Vite | 빠른 HMR |
| 언어 | TypeScript (strict) | `any` 금지 |
| 프레임워크 | React 18 | function component only |
| 라우팅 | React Router v6 | |
| 상태(서버) | TanStack Query | 캐시·재시도·refetch |
| 상태(UI) | Zustand | 전역 UI 토글·테마 등 최소 |
| 스타일 | TailwindCSS + 디자인 토큰 (CSS vars) | inline style 금지 |
| 차트 | **ECharts** (echarts-for-react) | Recharts 사용 금지 — 일관성 |
| 아이콘 | lucide-react | |
| 폼 | react-hook-form + zod | 필요 시점에만 |
| 테스트 | Vitest + React Testing Library | 핵심 컴포넌트만 |
| **그리드** | **react-grid-layout (legacy import)** | 드래그·리사이즈·CRUD 위젯. WidthProvider HOC 패턴 필수 |

## 4. 디자인 일관성

- **모든 차트는 ECharts.** Recharts/Chart.js/D3 직접 사용 금지.
- **모든 색상은 디자인 토큰 경유.** Tailwind 임의 색상 (`text-red-500` 등) 직접 사용 금지 — 토큰 매핑된 클래스만.
- **다크 우선.** 라이트 테마는 v2 이후.
- **심각도 5단계** (`Info / Low / Medium / High / Critical`) 색상은 [docs/design-tokens.md](docs/design-tokens.md) 의 5색 외 사용 금지.
- **숫자 포맷·날짜 포맷은 한 곳에서** (`src/lib/format.ts`). 페이지마다 다르게 쓰지 않는다.
- **위젯 카드 높이 통일.** 모든 KPI 카드는 `h-full w-full flex flex-col` 패턴. ECharts 는 `ResizeObserver` 로 부모 크기 변경 시 `resize()` 자동 호출.

## 4.1 위젯 카탈로그 정책

- 새 위젯은 [docs/WIDGETS.md](docs/WIDGETS.md) 의 5단계 절차 (타입 등록 → 컴포넌트 → 렌더러 → 에디터 → 기본값) 모두 따른다.
- 위젯 타입 추가 시 `WidgetType` discriminated union 갱신 필수 — switch 누락 시 TS 컴파일 에러로 자동 검출.
- 기본 레이아웃 변경 시 `KEY_PREFIX` (현재 `v8`) 의 버전 올림 → 사용자 캐시 자동 무효화.
- 보안 탭과 인프라 탭의 **위젯 ID prefix 분리**: 보안 = `s-*`, 인프라 = `i-*`.

## 5. 백엔드 연동 정책

- TrinitySOC 는 **직접 TheHive/MISP/Shuffle 을 호출하지 않는다.** 모두 `SIEM-Trinity/02-detection` API 를 BFF(Backend For Frontend) 로 통과한다.
- 그 이유: CORS·인증 토큰 누출·CSP 충돌 회피. 그리고 SIEM-Trinity 가 단일 진입점이어야 운영 모델이 단순해진다.
- TrinitySOC 가 새 데이터를 요구할 때:
  1. 먼저 SIEM-Trinity 리포에 API 신설 issue/PR 을 만들고
  2. 머지된 뒤 TrinitySOC 에서 호출
- API 명세는 [docs/page-map.md](docs/page-map.md) 의 "백엔드 API 요구사항" 섹션에 누적.

## 6. Git 정책 (SIEM-Trinity CLAUDE.md §4 계승)

- `main` 직접 push 금지. 모든 변경은 PR.
- 브랜치: `feat/<page>`, `fix/<area>`, `chore/<topic>`, `refactor/<area>`
- 커밋 메시지 한국어 OK. 단 한 줄 요약은 명령형: "Overview KPI 카드 추가", "ECharts 공통 옵션 추출"
- PR 본문에 **스크린샷 1장 필수** (UI 작업이라 시각 확인이 핵심). 백엔드 작업은 예외.
- 한 PR 한 페이지/컴포넌트 원칙. 디자인 토큰 변경은 별도 PR.

## 7. 개발 사이클

1. 페이지 추가 → [docs/page-map.md](docs/page-map.md) 갱신
2. 새 API 필요 → SIEM-Trinity 에 issue 발행
3. 디자인 토큰 추가 → [docs/design-tokens.md](docs/design-tokens.md) 갱신
4. 컴포넌트 분리 기준: 같은 마크업이 **3번** 반복되면 그제서야 추출
5. 빌드 / type-check / lint 통과 + 스크린샷 → PR

## 8. 인간 파트너십

- 돌이키기 어려운 작업은 사전 확인 (브랜드명·라우트 변경·디자인 토큰 일괄 교체 등은 승인 후).
- 권한은 매번 그 범위에 한정.
- 모르면 모른다고. 라이브러리 동작·CSS 동작·API 응답 형태를 추측해 단정하지 않는다. 모르면 문서/소스를 확인한다.

## 9. 메모리 정책

전역 CLAUDE.md (`~/.claude/CLAUDE.md`) 의 auto-memory 시스템을 단일 소스로 사용. TrinitySOC 루트에 별도 MEMORY.md 만들지 않는다.
