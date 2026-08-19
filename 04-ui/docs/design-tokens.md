# TrinitySOC 디자인 토큰 (초안)

## 색상 (다크 우선)

| 토큰 | hex | 용도 |
|---|---|---|
| `bg-base` | `#0b0f17` | 페이지 배경 |
| `bg-surface` | `#131a26` | 카드/패널 |
| `bg-elevated` | `#1b2433` | 모달/드롭다운 |
| `border-subtle` | `#23304a` | 경계선 |
| `text-primary` | `#e6edf7` | 기본 텍스트 |
| `text-secondary` | `#9aa7bd` | 보조 텍스트 |
| `accent-info` | `#38bdf8` | 정보·링크 |
| `accent-ok` | `#34d399` | 정상·성공 |
| `accent-warn` | `#fbbf24` | 경고 |
| `accent-crit` | `#f87171` | 위험·차단 |
| `accent-brand` | `#a78bfa` | 브랜드 강조 |

## 심각도 5단계 (탐지·대응 공통)

| Level | Label | Color | 사용처 |
|---|---|---|---|
| 0 | Info | `accent-info` | 정보성 알람 |
| 1 | Low | `#60a5fa` | 낮은 위험 |
| 2 | Medium | `accent-warn` | 보통 위험 |
| 3 | High | `#fb923c` | 높은 위험 |
| 4 | Critical | `accent-crit` | 즉시 대응 |

## 타이포

- 본문: `Inter`, system-ui
- 코드/로그: `JetBrains Mono`, `Fira Code`, monospace
- 사이즈 스케일: 12 / 14 / 16 / 20 / 24 / 32

## 간격·그리드

- 기본 spacing: 4px 베이스 (4 / 8 / 12 / 16 / 24 / 32 / 48)
- 카드 radius: 12px
- 그림자: 다크 테마는 그림자 최소화, border + bg-elevated 로 깊이 표현

## ECharts 공통 옵션

- 배경 투명, grid line: `border-subtle`
- legend·tooltip 폰트: text-primary, 12px
- 색상 시퀀스: brand → info → ok → warn → crit 순환
