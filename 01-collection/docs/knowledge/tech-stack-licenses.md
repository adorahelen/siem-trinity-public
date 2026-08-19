# 기술 스택 및 라이센스 현황

> 최종 업데이트: 2026-03-12

프로젝트에서 사용 중인 오픈소스 및 자체 개발 컴포넌트 전체 목록입니다.

---

## 컨테이너 서비스 (Docker)

| 기술 | 버전 | 라이센스 | 오픈소스 | 상업적 이용 | 비고 |
|------|------|----------|----------|-------------|------|
| **Loki** | 2.9.4 | AGPL v3.0 | O | 조건부 허용 | 수정 후 서비스 제공 시 소스 공개 의무. 미수정 사용은 자유 |
| **Promtail** | 2.9.4 | AGPL v3.0 | O | 조건부 허용 | Loki와 동일. 2025-02-13 이후 LTS 전환 (deprecated) |
| **Grafana** | 10.3.3 | AGPL v3.0 | O | 조건부 허용 | 상업용 라이센스 별도 구매 가능 (Grafana Labs) |
| **Prometheus** | latest | Apache 2.0 | O | 완전 허용 | CNCF graduated 프로젝트. 제한 없음 |
| **Node Exporter** | latest | Apache 2.0 | O | 완전 허용 | Prometheus 생태계. 제한 없음 |
| **Wazuh Manager** | 4.14.3 | GPL v2 + Apache 2.0 | O | 완전 허용 | 이중 라이센스. 상업적 지원 구매 가능 |

---

## 호스트 레벨 서비스

| 기술 | 라이센스 | 오픈소스 | 상업적 이용 | 비고 |
|------|----------|----------|-------------|------|
| **nginx** | BSD 2-Clause | O | 완전 허용 | nginx Plus는 유료 상업 버전 (별개) |
| **ModSecurity** | Apache 2.0 | O | 완전 허용 | 2024년 OWASP 재단에 기부됨 |
| **fail2ban** | GPL v2+ | O | 완전 허용 | 엔터프라이즈 에디션 없음. 완전 무료 |
| **UFW** | GPL v3.0 | O | 완전 허용 | Ubuntu 기본 방화벽 도구 |
| **Tailscale** | 혼합 | 부분 | 조건부 허용 | 클라이언트 소스 공개, 컨트롤 서버는 클로즈드 소스 (프리미엄) |
| **systemd** | LGPL v2.1+ | O | 완전 허용 | 일부 udev 컴포넌트는 GPL v2+ |
| **Docker Engine** | Apache 2.0 | O | 완전 허용 | Docker Desktop은 대기업 상업 이용 제한 있음 |
| **Docker Compose** | Apache 2.0 | O | 완전 허용 | 제한 없음 |

---

## 커스텀 개발 및 기타

| 기술 | 라이센스 | 오픈소스 | 상업적 이용 | 비고 |
|------|----------|----------|-------------|------|
| **Python 3.x** | PSFL (BSD-style) | O | 완전 허용 | GPL 호환. 상업적 제한 없음 |
| **Filebeat** | Apache 2.0 + Elastic License | O | 조건부 허용 | 코어는 Apache 2.0, x-pack 기능은 Elastic License |
| **exporter/collector.py** | — | 자체 개발 | — | Python으로 직접 작성한 커스텀 익스포터 |
| **grafana/dashboards/*.json** | — | 자체 개발 | — | 직접 구성한 보안 대시보드 |
| **ip-api.com** | 프리미엄 SaaS | X (외부 API) | 무료 티어 제한 있음 | 월 45,000 요청 무료. 초과 시 유료 |

---

## 라이센스별 분류 요약

| 라이센스 | 해당 기술 | 핵심 제약 |
|----------|----------|----------|
| **AGPL v3.0** | Loki, Promtail, Grafana | 수정 후 네트워크 서비스 제공 시 소스 공개 의무 |
| **Apache 2.0** | Prometheus, Node Exporter, ModSecurity, Docker, Filebeat(코어) | 특허 조항 포함. 실질적 제한 없음 |
| **GPL v2/v3** | Wazuh, fail2ban, UFW | 배포 시 소스 공개 의무 |
| **BSD 2-Clause** | nginx | 가장 관대한 라이센스. 거의 제한 없음 |
| **LGPL v2.1+** | systemd | 라이브러리 링크 시 소스 공개 불필요 |
| **PSFL** | Python | BSD 호환. 제한 없음 |
| **혼합/독점** | Tailscale, ip-api.com | 컨트롤 서버 클로즈드, API 사용량 제한 |

---

## 주의사항

- **AGPL 적용 3종 (Loki, Promtail, Grafana):** 내부 모니터링 용도로 미수정 사용이므로 현재는 문제 없음. 만약 수정해서 외부에 서비스로 제공한다면 소스 공개 의무 발생
- **Tailscale:** 컨트롤 플레인이 클로즈드 소스이므로 장애 시 Tailscale 의존성 존재
- **Promtail:** 공식적으로 deprecated 상태. Grafana Alloy로 마이그레이션 권장
