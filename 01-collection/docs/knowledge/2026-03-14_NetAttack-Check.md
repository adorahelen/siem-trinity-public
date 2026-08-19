# 네트워크 기반 공격 기술 vs 현재 프로젝트 대응 현황 (2026-03-14)

## 현재 스택 요약
| 계층 | 도구 |
|------|------|
| 방화벽 (L3/L4) | UFW + ipset KR-ONLY (iptables) |
| 자동 차단 | fail2ban |
| WAF (L7) | nginx + ModSecurity (CRS 룰셋) |
| HIDS | Wazuh Manager + Agent |
| NIDS | Suricata (EVE JSON) + Zeek (conn/dns/http/ssl/notice/weird) |
| VPN | Tailscale (100.64.0.0/10) |
| 로그 수집 | Promtail → Loki → Grafana |

---

## 공격 유형별 대응 현황

### 1. 정찰 / 스캐닝 (Reconnaissance)

| 공격 기법 | 설명 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| 포트 스캔 (nmap, masscan) | 다수 포트에 TCP SYN/ACK 패킷 전송 | Zeek (notice: Scan), Suricata, UFW | ★★★★☆ | Zeek `Scan::Port_Scan` notice 탐지. 차단은 fail2ban 연계 필요 |
| OS 핑거프린팅 | TTL, TCP 옵션으로 OS 추측 | Zeek weird.log | ★★★☆☆ | 탐지는 되나 자동 차단 없음 |
| 배너 그래빙 | 서비스 버전 노출 시도 | nginx 헤더 숨김 권장 | ★★☆☆☆ | 현재 nginx `server_tokens off` 설정 여부에 따라 다름 |
| DNS 정찰 | 서브도메인 bruteforce, zone transfer 시도 | Zeek dns.log, Suricata | ★★★☆☆ | Zeek DNS 쿼리 기록. 이상 패턴은 Suricata 탐지 |

---

### 2. 인증 공격 (Authentication Attacks)

| 공격 기법 | 설명 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| SSH 브루트포스 | 반복 SSH 로그인 시도 | fail2ban (sshd jail), Wazuh, auth.log | ★★★★★ | fail2ban 5회 실패 시 Ban. Wazuh rule 5710 탐지. Loki auth job 모니터링 |
| SSH 딕셔너리 공격 | 일반 계정명/패스워드 대입 | fail2ban + KR-ONLY | ★★★★★ | 비한국 IP는 연결 자체 차단 (iptables L3). 한국 IP도 fail2ban 적용 |
| FTP/Telnet 브루트포스 | FTP/Telnet 인증 반복 시도 | UFW (포트 차단) | ★★★★☆ | UFW에서 21/23 차단 시 원천 차단. 현재 설정 확인 필요 |
| HTTP 로그인 브루트포스 | 웹 로그인 폼 반복 대입 | ModSecurity (rate limit 룰), fail2ban nginx jail | ★★★☆☆ | CRS 룰셋 제한 탐지. fail2ban nginx-http-auth jail 설정 필요 |
| 크리덴셜 스터핑 | 유출된 계정 정보 대입 | ModSecurity, Wazuh | ★★☆☆☆ | 패턴 기반 탐지만 가능. 계정별 맥락 파악 어려움 |

---

### 3. 서비스 거부 / 가용성 공격 (DoS / DDoS)

| 공격 기법 | 설명 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| SYN Flood | 대량 SYN 패킷으로 연결 고갈 | UFW, KR-ONLY, Suricata | ★★★☆☆ | 커널 syncookie 설정 + KR-ONLY로 소스 제한. 대역폭 DDoS는 ISP 레벨 필요 |
| UDP Flood | 대량 UDP 패킷 | UFW (stateless block), Suricata | ★★★☆☆ | UFW 기본 거부 정책이 있으면 1차 차단 |
| ICMP Flood (Ping Flood) | 대량 ping으로 자원 소모 | UFW (ICMP rate limit), KR-ONLY | ★★★☆☆ | UFW에서 ICMP 제한 설정 시 완화 |
| HTTP Flood (L7 DDoS) | 대량 정상 HTTP 요청 | nginx rate_limit, ModSecurity, fail2ban | ★★★☆☆ | nginx limit_req_zone 설정 + ModSecurity HTTP anomaly score |
| Slowloris | 느린 HTTP 헤더로 연결 점유 | nginx (keepalive_timeout, client_header_timeout) | ★★★☆☆ | nginx 타임아웃 설정으로 완화. 현재 설정 확인 필요 |
| 분산 DDoS (대용량) | 수천 IP에서 동시 트래픽 | KR-ONLY (비한국 IP 원천 차단) | ★★★☆☆ | 해외 봇넷 차단 효과 있음. 국내 좀비 PC 경유 시 한계 |

---

### 4. 웹 애플리케이션 공격 (Web Application Attacks)

| 공격 기법 | 설명 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| SQL 인젝션 (SQLi) | DB 쿼리 조작 시도 | ModSecurity CRS (942xxx 룰), Zeek http.log, PostgreSQL 로그 | ★★★★☆ | CRS가 대부분의 SQLi 패턴 탐지. Loki modsec + postgresql job 이중 모니터링 |
| XSS (Cross-Site Scripting) | 악성 스크립트 삽입 | ModSecurity CRS (941xxx 룰) | ★★★★☆ | Reflected/Stored XSS 공통 패턴 차단 |
| CSRF | 위조 요청으로 동작 유발 | ModSecurity (토큰 검증 룰 필요) | ★★☆☆☆ | 앱 레벨 구현 필요. WAF만으로는 한계 |
| 파일 인클루전 (LFI/RFI) | 파일 경로 조작으로 서버 파일 열람 | ModSecurity CRS (930xxx 룰) | ★★★★☆ | Path traversal, `../` 패턴 차단 |
| 명령 인젝션 (RCE) | 시스템 명령 실행 유도 | ModSecurity CRS (932xxx 룰), Wazuh (FIM) | ★★★★☆ | CRS 탐지 + Wazuh 파일 무결성으로 사후 탐지 |
| SSRF | 서버가 내부 리소스 요청하도록 유도 | ModSecurity (일부 패턴), Zeek | ★★☆☆☆ | 전용 룰 추가 필요. 기본 CRS는 제한적 |
| Directory Traversal | 허용되지 않은 경로 접근 | ModSecurity CRS (930xxx), nginx (location 제한) | ★★★★☆ | CRS + nginx deny 설정으로 이중 차단 |
| HTTP Parameter Pollution | 중복 파라미터로 서버 혼란 유발 | ModSecurity CRS | ★★★☆☆ | CRS 기본 탐지 |

---

### 5. 네트워크 스푸핑 / 가로채기 (Spoofing / MitM)

| 공격 기법 | 설명 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| ARP 스푸핑 | L2 ARP 응답 위조로 트래픽 가로채기 | Zeek (arp 탐지 스크립트 필요), Suricata | ★★☆☆☆ | 기본 Zeek/Suricata 룰셋에 ARP 탐지 포함 여부 확인 필요. 홈서버(단일 인터페이스) 환경에서 위험도 낮음 |
| IP 스푸핑 | 송신 IP 위조 | UFW + KR-ONLY (rp_filter) | ★★★☆☆ | Linux `rp_filter=1` 활성 시 비정상 소스 IP 차단 |
| DNS 스푸핑 / 캐시 포이즈닝 | DNS 응답 위조 | Zeek dns.log 이상 탐지, DNSSEC (미설정 시 취약) | ★★☆☆☆ | Zeek DNS 기록으로 사후 탐지. DNSSEC 미설정 시 예방 한계 |
| SSL Stripping | HTTPS → HTTP 다운그레이드 | nginx (HSTS 헤더), Zeek ssl.log | ★★★★☆ | nginx `add_header Strict-Transport-Security` + Zeek TLS 버전 모니터링 |
| BGP 하이재킹 | 라우팅 경로 탈취 | 탐지 불가 (ISP/AS 레벨 문제) | ★☆☆☆☆ | 개인 서버 레벨 대응 불가. 탐지도 어려움 |
| MITM (중간자 공격) | 통신 가로채기/변조 | Tailscale (E2E 암호화), nginx TLS, Zeek ssl.log | ★★★★☆ | Tailscale WireGuard 암호화로 VPN 경로 보호. nginx HTTPS 강제 |

---

### 6. 침투 / 후속 공격 (Post-Exploitation)

| 공격 기법 | 설명 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| 리버스 쉘 (Reverse Shell) | 피해 서버가 공격자에게 연결 | Wazuh (프로세스 모니터링), Suricata (C2 시그니처) | ★★★☆☆ | Wazuh 비정상 프로세스 탐지 + Suricata C2 룰셋. KR-ONLY로 해외 C2 연결 차단 효과 |
| C2 통신 (Command & Control) | 악성코드가 C2 서버와 통신 | Suricata (ET 룰셋), Zeek conn.log, KR-ONLY | ★★★☆☆ | Suricata ET Open 룰셋이 알려진 C2 도메인/IP 차단. 미지 C2는 한계 |
| 권한 상승 (Privilege Escalation) | 일반 계정 → root 권한 탈취 | Wazuh (FIM, sudo 모니터링), auth.log | ★★★★☆ | Wazuh rule 5402 (sudo) + 파일 무결성 모니터링 |
| 횡이동 (Lateral Movement) | 내부망 다른 시스템으로 이동 | Zeek conn.log, Wazuh, 내부망 분리 | ★★★☆☆ | Docker 네트워크 격리 + Zeek 내부 연결 모니터링. 호스트 간 이동은 탐지 제한 |
| 데이터 유출 (Data Exfiltration) | 대용량 아웃바운드 전송 | Zeek conn.log (bytes 분석), Suricata | ★★★☆☆ | Zeek `orig_bytes`/`resp_bytes` 이상 탐지. 임계값 기반 알람 설정 필요 |
| 파일 변조 / 루트킷 | 시스템 파일 교체 | Wazuh FIM (syscheck), dpkg.log | ★★★★☆ | Wazuh `/etc`, `/bin`, `/usr/bin` 체크섬 모니터링 |
| Crontab 지속성 | 악성 cron 작업 등록 | Wazuh (cron 모니터링), crontab 로그 | ★★★★☆ | Wazuh rule 2830 계열 + syslog CRON 이벤트 모니터링 |

---

### 7. 암호화 / 터널링 우회 (Evasion)

| 공격 기법 | 설명 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| DNS 터널링 | DNS 쿼리/응답으로 데이터 은닉 전송 | Zeek dns.log (쿼리 길이/빈도 이상), Suricata | ★★★☆☆ | Zeek에서 비정상 DNS 쿼리 길이 탐지 가능. 전용 룰 추가 권장 |
| HTTPS 터널링 | 정상 HTTPS 안에 C2 숨김 | Zeek ssl.log (JA3/JA3S 핑거프린팅) | ★★☆☆☆ | JA3 스크립트 로드 시 탐지 가능. 기본 설정으로는 제한적 |
| ICMP 터널링 | ping 패킷 페이로드에 데이터 은닉 | Suricata, Zeek | ★★☆☆☆ | 비정상 ICMP 페이로드 크기로 탐지 시도 |
| 포트 우회 (443/80 사용 C2) | 허용 포트로 C2 트래픽 위장 | Suricata (DPI), Zeek ssl/http 분석 | ★★★☆☆ | DPI 기반 콘텐츠 패턴 분석. 암호화 C2는 행위 기반 탐지 필요 |
| 분절화 (Fragmentation) | IP 단편화로 IDS 서명 우회 | Suricata (defrag 엔진) | ★★★★☆ | Suricata 기본 IP 재조립 기능으로 단편화 우회 대응 |

---

## 종합 평가

| 공격 카테고리 | 평균 대응 수준 | 핵심 강점 | 주요 취약점 |
|--------------|--------------|-----------|------------|
| 정찰/스캐닝 | ★★★☆☆ | Zeek 네트워크 분석 | 자동 차단 연계 부족 |
| 인증 공격 | ★★★★★ | fail2ban + KR-ONLY 이중 차단 | HTTP 브루트포스 jail 미설정 시 |
| DoS/DDoS | ★★★☆☆ | KR-ONLY로 해외 소스 차단 | 대용량 DDoS는 ISP 레벨 필요 |
| 웹 공격 | ★★★★☆ | ModSecurity CRS 포괄적 탐지 | CSRF, SSRF 전용 룰 보완 필요 |
| 스푸핑/MitM | ★★★☆☆ | Tailscale E2E + nginx HSTS | ARP/DNS 레벨 예방 제한 |
| 후속 공격 | ★★★★☆ | Wazuh FIM + 프로세스 모니터링 | 암호화 C2 탐지 한계 |
| 우회/터널링 | ★★★☆☆ | Suricata DPI + Zeek 분석 | JA3, DNS 터널링 전용 룰 필요 |

---

## 개선 권고사항 (우선순위 순)

1. **fail2ban nginx jail 추가** — HTTP 브루트포스 대응 (`/etc/fail2ban/jail.d/nginx.conf`)
2. **Zeek UFW 차단 연동** — `Scan::Port_Scan` notice → fail2ban → iptables 자동 차단 파이프라인
3. **Suricata ET Open 룰셋 활성화 확인** — C2, DNS 터널링, ICMP 터널링 시그니처 포함
4. **Zeek JA3/JA3S 스크립트 로드** — HTTPS 터널링 및 악성 TLS 클라이언트 핑거프린팅
5. **DNS 터널링 전용 탐지** — 쿼리 길이 > 50자, 분당 쿼리 수 임계값 설정
6. **nginx 설정 검토** — `server_tokens off`, `client_header_timeout`, `limit_req_zone` 확인
7. **rp_filter 확인** — `sysctl net.ipv4.conf.all.rp_filter` = 1 (IP 스푸핑 방어)
8. **Zeek 포트 9991~9994 UFW 차단** — `ufw deny 9991~9994` (외부 노출 차단)

---

---

## 8. 스니핑 (Sniffing) 상세 분석

> 스니핑: 네트워크를 흐르는 패킷을 수동/능동적으로 캡처해 민감 정보(자격증명, 세션 쿠키, 데이터) 획득

### 공격 유형별 대응

| 공격 기법 | 원리 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| **패시브 스니핑** | 허브/공유 세그먼트에서 모든 패킷 수신 | nginx TLS 강제, Tailscale WireGuard | ★★★★☆ | 트래픽이 암호화되면 캡처해도 평문 노출 없음 |
| **액티브 스니핑 (ARP 스푸핑 경유)** | ARP 위조 → 트래픽 자신에게 유인 → 캡처 | Zeek, Suricata | ★★☆☆☆ | 탐지는 가능하나 예방 도구 없음. 동일 L2 세그먼트 내 공격자 필요 |
| **DNS 스니핑** | 평문 DNS 쿼리 캡처 → 접속 사이트 파악 | Zeek dns.log (사후 탐지) | ★★☆☆☆ | DoT/DoH 미설정 시 DNS 평문 노출. 탐지만 가능, 예방은 암호화 필요 |
| **Wi-Fi 스니핑** | 무선 패킷 모니터 모드로 캡처 | Tailscale (VPN 전 트래픽 암호화) | ★★★★☆ | Tailscale 경유 시 WireGuard 암호화로 평문 노출 없음 |
| **SSL/TLS 스니핑** | HTTPS 트래픽 캡처 (복호화 시도) | nginx TLS 1.2+, Zeek ssl.log | ★★★★☆ | TLS 1.3 + ECDHE(PFS) 사용 시 세션키 탈취 불가 |
| **내부 컨테이너 스니핑** | Docker bridge 트래픽 캡처 | Docker 네트워크 격리 (별도 bridge) | ★★★☆☆ | 같은 Docker bridge 내 컨테이너 간 평문 통신 가능. 민감 서비스 분리 필요 |

### 스니핑 핵심 방어: 현재 상태

```
외부 인터넷 → nginx HTTPS (TLS 1.2+)       ✅ 암호화됨
맥북 → 서버 SSH via Tailscale              ✅ WireGuard E2E 암호화
서버 → Docker 컨테이너 내부 통신            ⚠️ 평문 (동일 bridge 내)
서버 DNS 쿼리 (시스템 리졸버)              ⚠️ 평문 (DoT/DoH 미설정 가정)
```

---

## 9. 하이재킹 (Hijacking) 상세 분석

> 하이재킹: 정상적으로 수립된 연결/세션을 탈취하여 제어권 획득

### 공격 유형별 대응

| 공격 기법 | 원리 | 대응 도구 | 대응 수준 | 비고 |
|-----------|------|-----------|-----------|------|
| **TCP 세션 하이재킹** | ISN(시퀀스 번호) 예측 → 패킷 삽입 → 세션 탈취 | 현대 OS 랜덤 ISN + TLS | ★★★★★ | Linux 커널이 암호학적 랜덤 ISN 생성. TLS 위에서는 추가로 불가 |
| **HTTP 세션 하이재킹 (쿠키 탈취)** | 평문 쿠키 스니핑 or XSS로 획득 | nginx HTTPS + ModSecurity (XSS 차단) | ★★★★☆ | HTTPS 강제 시 전송 중 쿠키 탈취 불가. XSS는 CRS로 차단 |
| **SSL 하이재킹 (SSL Stripping)** | HTTP 다운그레이드 유도 | nginx HSTS + Zeek ssl.log | ★★★★☆ | HSTS로 브라우저가 HTTPS 강제. Zeek에서 TLS 버전 다운그레이드 탐지 |
| **DNS 하이재킹** | DNS 응답 위조 → 악성 서버로 유도 | Zeek dns.log (이상 탐지), DNSSEC 미설정 | ★★★☆☆ | 로컬 DNS 캐시 오염 탐지는 Zeek 가능. DNSSEC 설정 시 근본 예방 |
| **ARP 하이재킹** | ARP 위조 → 게이트웨이/피해자 트래픽 유인 | Zeek (arp 스크립트 필요), static ARP 설정 | ★★☆☆☆ | 홈서버 환경(단일 호스트)에서 실질 위험 낮음. 동일 네트워크 내 공격자 필요 |
| **BGP 하이재킹** | AS 라우팅 경로 탈취 → 트래픽 우회 | 탐지/대응 불가 (ISP 레벨) | ★☆☆☆☆ | 개인 서버 레벨 대응 불가. 글로벌 라우팅 인프라 문제 |
| **SSH 세션 하이재킹** | SSH 연결 가로채기 (구형 구현 취약점) | OpenSSH 최신 버전, Tailscale SSH | ★★★★★ | 최신 OpenSSH는 MAC(메시지 인증 코드)로 패킷 변조 탐지. Tailscale 추가 암호화 |
| **클릭재킹 (Clickjacking)** | iframe 중첩으로 UI 위장 | nginx `X-Frame-Options: DENY`, ModSecurity | ★★★★☆ | nginx 보안 헤더로 iframe 차단 |
| **중간자 인증서 교체 (SSL MitM)** | 자체 CA 인증서로 TLS 가로채기 | Zeek ssl.log (인증서 해시 모니터링), HPKP | ★★★☆☆ | Zeek에서 인증서 변경 탐지 가능. 인증서 고정(HPKP) 미설정 시 한계 |
| **세션 고정 (Session Fixation)** | 공격자가 미리 설정한 세션 ID 사용 유도 | 앱 레벨 구현 필요 (로그인 후 세션 재발급) | ★★☆☆☆ | WAF만으로 대응 불가. 웹앱 코드에서 세션 재발급 필수 |

### 하이재킹 핵심 방어: 계층별 구조

```
계층               공격            현재 방어           상태
─────────────────────────────────────────────────────────
L2 (데이터링크)   ARP 하이재킹    정적 ARP 미설정      ⚠️ 탐지만
L3 (네트워크)     IP 스푸핑       rp_filter, KR-ONLY   ✅
L3 (라우팅)       BGP 하이재킹    대응 불가            ❌
L4 (전송)         TCP 하이재킹    랜덤 ISN + TLS       ✅
L7 (응용)         세션 하이재킹   HTTPS + HSTS + CSP   ✅
L7 (DNS)          DNS 하이재킹    Zeek 탐지 (DNSSEC X) ⚠️
VPN 계층          SSH/VPN 탈취    Tailscale WireGuard  ✅
```

### 스니핑·하이재킹 종합 보안 등급

| 항목 | 등급 | 근거 |
|------|------|------|
| 외부 → 서버 트래픽 보호 | ★★★★★ | nginx TLS 1.2+ 강제, HSTS |
| 관리자 접속 보호 | ★★★★★ | Tailscale WireGuard E2E |
| 세션 쿠키 보호 | ★★★★☆ | HTTPS 강제 (Secure 플래그 앱 레벨 의존) |
| DNS 평문 노출 | ★★★☆☆ | DoT/DoH 미설정 시 취약 (Zeek로 탐지만) |
| ARP/L2 하이재킹 | ★★☆☆☆ | 동일 세그먼트 공격자 시 예방 어려움 |
| Docker 내부 통신 | ★★★☆☆ | bridge 내 평문 — 민감 서비스 TLS 권장 |
| BGP/라우팅 탈취 | ★☆☆☆☆ | ISP 레벨, 개인 서버 대응 불가 |

---

### 스니핑·하이재킹 개선 권고

1. **DNS over TLS (DoT)** — systemd-resolved 또는 Unbound 설치 (`/etc/systemd/resolved.conf` → `DNS=1.1.1.1`, `DNSOverTLS=yes`)
2. **nginx 보안 헤더 완성** — `X-Frame-Options`, `Content-Security-Policy`, `X-Content-Type-Options` 확인
3. **Zeek ARP 탐지 스크립트** — `/opt/zeek/share/zeek/policy/protocols/arp/` 로드
4. **DNSSEC 검증 활성화** — 로컬 DNS 리졸버에서 DNSSEC validation 활성화
5. **Docker 민감 서비스 TLS** — PostgreSQL, Loki 등 컨테이너 내부 통신에도 TLS 적용 고려

---

## 결론

현재 프로젝트는 **일반적인 인터넷 공격(SSH 브루트포스, 웹 공격, 비한국 IP 접근)에 대해 상당히 견고**한 다층 방어를 갖추고 있습니다.

- **최강점**: KR-ONLY + fail2ban 조합으로 해외 봇넷/스캐너 원천 차단
- **보조 강점**: ModSecurity CRS로 웹 공격 80%+ 커버, Wazuh로 호스트 이상 탐지
- **상대적 취약점**: 고도화된 우회 기법(암호화 C2, DNS 터널링), 대용량 DDoS, CSRF/SSRF
- **감지 사각지대**: BGP 하이재킹(ISP 레벨), 내부 횡이동(Docker 간 이동)
