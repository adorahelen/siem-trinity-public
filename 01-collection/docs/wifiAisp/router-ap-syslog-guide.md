# 네트워크 장비 Syslog 연동 가이드

- 작성 일시: 2026-03-13 KST
- 대상: ISP 단말기, 가정용/소형 Wi-Fi 공유기, AP 로그를 `security-log-monitor`로 수집하려는 경우

---

## 목적

현재 프로젝트는 미니PC 내부의 보안 이벤트를 잘 수집한다.

- `auth.log`, `UFW`, `fail2ban`
- `nginx`, `ModSecurity`
- `Docker`, `Wazuh`

하지만 미니PC 앞단에 있는 네트워크 장비는 아직 관제 범위에 거의 들어오지 않는다.

이 문서의 목표는 아래 2가지다.

1. ISP 단말기 / 공유기 / AP 로그를 미니PC로 수집할 수 있는지 판단한다.
2. 수집 가능하다면 `syslog -> 파일 저장 -> Promtail -> Loki -> Grafana` 흐름으로 붙일 준비를 한다.

---

## 무엇을 보고 싶은가

네트워크 장비 로그를 붙이는 이유는 단순히 "로그를 더 많이 모으기 위해서"가 아니다.
미니PC 관제만으로는 보이지 않는 앞단 이벤트를 보려는 것이다.

주요 관제 목표:

- 관리자 로그인 성공/실패
- 설정 변경, 재부팅, 펌웨어 업데이트
- WAN 연결 끊김/복구
- DHCP 할당 이력
- 포트포워딩, 방화벽 정책 변경
- 무선 단말 접속/이탈
- 무선 인증 실패, 반복 인증 시도
- 내부 단말 스캔이나 이상 접속의 단서

보안관제 관점에서 기대 효과:

- 미니PC에 닿기 전 단계의 네트워크 이상 징후 확인
- 무선 단말 또는 내부 단말에서 시작된 접근 시도 추적
- 공유기/AP 관리자 계정 악용 여부 확인
- 장비 재부팅, 설정 변경 같은 운영 이상행위 감시

---

## 먼저 확인할 점

핵심은 프로젝트가 아니라 장비 지원 여부다.

프로젝트 구조상 로그 수집은 가능하지만, 장비가 아래 중 하나를 지원해야 실제 연동이 된다.

- `Remote Syslog` / `Syslog Server` / `Log Server`
- 로그 다운로드
- API
- SSH / Telnet CLI

가장 좋은 경우:

- 공유기 또는 AP가 외부 syslog 서버 주소를 입력받을 수 있음

어려운 경우:

- 관리자 페이지에서 GUI로만 로그를 보여주고 외부 전송 기능이 없음

권장 확인 메뉴:

- `System Log`
- `Administration`
- `Maintenance`
- `Remote Log`
- `Syslog`
- `Log Server`
- `Debug`

정리:

- GUI에서 로그가 보인다고 자동 수집 가능한 것은 아니다.
- `외부 전송 기능` 또는 `API/CLI`가 있어야 자동화가 가능하다.

---

## 권장 수집 구조

가장 안정적인 방식은 아래 구조다.

```text
[ISP 단말기 / Wi-Fi 공유기 / AP]
        |
        |  syslog (UDP 514 또는 장비 지정 포트)
        v
[미니PC rsyslog/syslog-ng]
        |
        |  파일 저장
        v
[/var/log/network-devices/*.log]
        |
        |  Promtail tail
        v
[Loki]
        |
        v
[Grafana]
```

장점:

- 장비 교체 전까지 비교적 안정적
- 브라우저 로그인 자동화보다 유지보수가 쉬움
- Loki/Grafana 기존 파이프라인과 자연스럽게 연결됨

---

## 미니PC에서 syslog 수신 준비

Ubuntu 계열이라면 `rsyslog`가 기본 설치되어 있는 경우가 많다.

먼저 확인:

```bash
systemctl status rsyslog
```

없다면 설치:

```bash
sudo apt update
sudo apt install -y rsyslog
```

로그 저장 디렉터리 생성:

```bash
sudo mkdir -p /var/log/network-devices
sudo chown syslog:adm /var/log/network-devices
sudo chmod 0755 /var/log/network-devices
```

`rsyslog` 수신 설정 파일 생성:

파일 경로 예시:

`/etc/rsyslog.d/30-network-devices.conf`

예시 내용:

```conf
module(load="imudp")
input(type="imudp" port="514")

template(name="PerHostLog" type="string"
  string="/var/log/network-devices/%HOSTNAME%.log")

if ($fromhost-ip != "127.0.0.1") then {
  action(type="omfile" dynaFile="PerHostLog")
  stop
}
```

설명:

- UDP 514 포트에서 syslog를 받는다.
- 보낸 장비 hostname 기준으로 파일을 나눈다.
- 로컬 로그와 분리해 저장한다.

문법 검사:

```bash
sudo rsyslogd -N1
```

재시작:

```bash
sudo systemctl restart rsyslog
sudo systemctl enable rsyslog
```

포트 확인:

```bash
ss -lunp | grep 514
```

UFW 사용 시 허용:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 514 proto udp
```

주의:

- 실제 내부 대역에 맞게 더 좁게 제한하는 것이 좋다.
- 외부 인터넷에 514/UDP를 열면 안 된다.

---

## 장비 쪽 설정

장비 관리자 페이지에서 아래 항목을 찾는다.

- `Remote Syslog`
- `Log Server`
- `Syslog Server IP`
- `Server Address`
- `Port`

입력 예시:

- 서버 IP: `미니PC 내부 IP`
- 프로토콜: `UDP`
- 포트: `514`

로그 전송 테스트 후 미니PC에서 확인:

```bash
sudo ls -l /var/log/network-devices
sudo tail -f /var/log/network-devices/*.log
```

보이는 로그 예시:

- 관리자 로그인
- DHCP lease 이벤트
- Wi-Fi association/disassociation
- WAN up/down
- firewall allow/deny

---

## GUI만 있고 syslog 메뉴가 없을 때

자동화 난이도가 올라간다.

가능한 우회 방법:

1. 로그 다운로드 버튼이 있는지 확인
2. 브라우저 개발자도구 `Network` 탭에서 로그 조회 API가 있는지 확인
3. SSH/Telnet CLI 지원 여부 확인
4. 그마저 없으면 GUI 스크래핑 검토

우선순위:

- `syslog` 지원
- `API`
- `SSH/Telnet`
- `GUI 스크래핑`

GUI 스크래핑은 가장 마지막 수단이다.
페이지 구조 변경, 세션 만료, CAPTCHA, 펌웨어 업데이트에 취약하다.

---

## 현재 프로젝트와 연동하는 방법

현재 저장소는 이미 `Promtail -> Loki -> Grafana` 파이프라인을 가지고 있다.
따라서 수신된 네트워크 장비 로그는 새 로그 파일만 잡아주면 된다.

예상 연동 순서:

1. 공유기/AP가 미니PC로 syslog 전송
2. `rsyslog`가 `/var/log/network-devices/*.log`로 저장
3. `config/promtail-config.yml`에 새 scrape job 추가
4. Loki에서 `job="network_device"` 형태로 조회
5. Grafana 패널/알림 추가

예상 라벨 예시:

- `job=network_device`
- `device=isp_router`
- `device=wifi_ap`

초기 대시보드 후보:

- 최근 관리자 로그인 이벤트
- 무선 인증 실패 추이
- DHCP 신규 할당 목록
- WAN down/up 이벤트
- 장비 재부팅/설정 변경 로그

---

## 이 연동이 특히 유용한 상황

- 미니PC는 멀쩡한데 인터넷이 자주 끊길 때
- 누가 공유기 관리자 페이지에 접속했는지 보고 싶을 때
- 무선 단말이 갑자기 많이 붙거나 떨어질 때
- 포트포워딩/방화벽 설정 변경이 의심될 때
- 내부망 이동의 초기 단서를 네트워크 장비 쪽에서 보고 싶을 때

즉, 이 연동은 "미니PC 내부 관제"를 "집 네트워크 경계 관제"로 조금 넓혀주는 작업이다.

---

## 한계

- ISP 제공 단말기는 외부 syslog를 지원하지 않을 수 있다.
- 가정용 공유기는 로그 품질이 낮거나 포맷이 제각각일 수 있다.
- 무선 접속 로그는 장비 제조사마다 큰 차이가 있다.
- NAC 수준의 정교한 사용자/단말 통제는 별도 기업용 솔루션 영역이다.

따라서 기대치는 아래처럼 잡는 것이 현실적이다.

- 가능: 공유기/AP 운영 로그, 접속 이벤트, 일부 보안 이벤트 수집
- 어려움: 기업형 NAC 수준의 가시성, 정교한 단말 식별, 정책 강제

---

## 다음 단계

추천 순서:

1. ISP 단말기와 Wi-Fi 공유기 관리자 페이지에서 `Remote Syslog` 지원 여부 확인
2. 가능하면 미니PC에 `rsyslog` 수신 구성
3. 실제 로그 유입 확인
4. 이후 `Promtail` 수집 설정 추가
5. Grafana 패널과 알림 규칙 설계

실무적으로는 `ISP 단말기`보다 `Wi-Fi 공유기/AP` 쪽이 연동 가능성이 더 높다.
