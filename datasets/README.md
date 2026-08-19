# Datasets — XDR 검증용 공개 데이터셋

> XDR epic (#4) 각 단계가 **공개 벤치마크 데이터에서 실제로 작동** 함을 증명하기 위한 자산.
> 각 데이터셋은 라이선스/크기/배포처에 따라 보관 방식이 다르다.

## 보관 전략 매트릭스

| 분류 | 크기 | 보관 방식 | 이유 |
|---|---|---|---|
| **In-repo** | < 100MB, 라이선스 OK, 안정적 | 직접 커밋 (`datasets/<name>/`) | 즉시 사용, 인터넷 의존 0 |
| **Submodule** | 외부 git repo 가 잘 관리됨 | `git submodule add` | 원천 갱신 자동 추적 |
| **외부 다운로드** | 수 GB+ 또는 등록 필요 | `scripts/fetch-*.sh` (URL만 코드에) | repo 비대화 방지 |

## 보관된 데이터셋

### attack/ — MITRE ATT&CK Enterprise STIX 2.1
- **위치**: `datasets/attack/enterprise-attack.json` (51MB) — 용량 때문에 **공개판에는 미포함**. [`scripts/refresh-attack.sh`](scripts/refresh-attack.sh)로 MITRE 원본에서 내려받는다.
- **출처**: [mitre-attack/attack-stix-data](https://github.com/mitre-attack/attack-stix-data)
- **라이선스**: ATT&CK Terms of Use (CC BY 4.0 호환)
- **내용**: 697 techniques + 15 tactics + groups/software/mitigations
- **갱신**: 4개월 주기 (수동) — `bash scripts/refresh-attack.sh`
- **사용처**:
  - 03-intelligence RAG knowledge: `python 03-intelligence/scripts/build_attack_knowledge.py`
  - 02-detection technique tagging (예정)

### 외부 다운로드 대상 (large datasets)

| 데이터셋 | 크기 | fetch 스크립트 | 라이선스 | 우리 단계 검증 |
|---|---|---|---|---|
| **AIT-LDS v2.0 + AIT-ADS** | ~20GB | [`scripts/fetch-ait-lds.sh`](scripts/fetch-ait-lds.sh) | CC BY 4.0 | 단계 5/6 풀 시나리오 |
| **CIC-IDS2017** | ~50GB (PCAP) | [`scripts/fetch-cic-ids2017.sh`](scripts/fetch-cic-ids2017.sh) | UNB 연구용 | 단계 2 SSH brute-force |
| **OTRF Security-Datasets** | ~수백 MB | [`scripts/fetch-otrf.sh`](scripts/fetch-otrf.sh) | MIT | 단계 3 ATT&CK 시뮬 |
| **PCAP-ATTACK** | ~수십 MB | [`scripts/fetch-pcap-attack.sh`](scripts/fetch-pcap-attack.sh) | MIT | Suricata 룰 회귀 |

## 리플레이 워크플로우

### A. PCAP → Suricata/Zeek (라이브 NIC 시뮬)

```bash
# 더미 NIC 생성 (호스트)
sudo ip link add dummy0 type dummy
sudo ip link set dummy0 up

# Suricata/Zeek 이 dummy0 을 listen 하도록 설정 후
sudo tcpreplay -i dummy0 --topspeed datasets/cic-ids2017/Tuesday-WorkingHours.pcap
```

빠른 단발 검증:
```bash
suricata -r file.pcap -l /var/log/suricata/
zeek -r file.pcap
```

### B. 사전 파싱 로그 → Promtail tail

```bash
# 로그를 promtail 이 보는 경로에 풀기
tar xf datasets/ait-lds/auth.tar.gz -C /var/log/replay/

# Loki ingestion 시 과거 타임스탬프 거부 회피 (loki-config.yml):
#   limits_config:
#     reject_old_samples: false
#     reject_old_samples_max_age: 8760h
```

자세한 단계별 매핑은 [epic #4 진행 코멘트](이슈 #4) 참조.

## 라이선스 주의

- ATT&CK: CC BY 4.0 — 출처 표시 필수 (본 README 의 출처 링크로 충족)
- AIT-LDS: CC BY 4.0
- CIC-IDS2017: 연구용 무료, 상업 사용 시 별도 협의
- OTRF Security-Datasets: MIT
- PCAP-ATTACK: MIT
