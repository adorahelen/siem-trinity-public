"""
TrinitySOC BFF (Backend For Frontend) — 통합 콘솔 전용 프록시 라우터.

TrinitySOC 가 TheHive/MISP/Loki 를 직접 호출하지 않고 이 라우터를 경유한다.
이유:
- CORS·인증 토큰을 클라이언트에 누출하지 않음
- 운영 진입점 단일화 (방화벽·로깅·인증 통일)
- 3rd-party API 응답을 TrinitySOC 친화 형태로 정규화

설계 원칙:
- 각 의존 도구가 비활성/실패해도 빈 응답으로 silent fail (탐지 파이프라인과 무관)
- 타임아웃 짧게 (BFF 가 SIEM-Trinity 자체 응답을 느리게 만들지 않음)
"""
from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query

try:
    import requests
except ImportError:
    requests = None  # type: ignore

import thehive_client
import misp_client
import auto_ban
from config import LOKI_URL


PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://intelligence-ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e2b-it-q4_K_M")

# 쓰기 액션·로그조회 API 키. 미설정 시 해당 엔드포인트를 전면 차단한다(fail-closed).
ACTIONS_API_KEY = os.getenv("ACTIONS_API_KEY", "")


def require_actions_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """/actions/* 쓰기 액션에 대한 API 키 검증.

    - ACTIONS_API_KEY 미설정 시: 503 으로 차단 (fail-closed)
    - 설정 시: X-API-Key 헤더가 일치해야 함
    """
    if not ACTIONS_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ACTIONS_API_KEY is not configured; write actions are disabled",
        )
    if not secrets.compare_digest(x_api_key or "", ACTIONS_API_KEY):
        raise HTTPException(status_code=401, detail="invalid or missing X-API-Key")


router = APIRouter(prefix="/api", tags=["bff"])


# ── 호스트 시스템 정보 (TrinitySOC ResourceCard 용) ────────
@router.get("/system/host")
def system_host() -> dict:
    """호스트 CPU/Mem/Disk 모델·크기 정보 + 현재 사용량."""
    if requests is None:
        raise HTTPException(503, "requests not available")

    def prom(expr: str) -> float | None:
        try:
            r = requests.get(
                f"{PROMETHEUS_URL.rstrip('/')}/api/v1/query",
                params={"query": expr},
                timeout=4,
            )
            result = r.json().get("data", {}).get("result", [])
            return float(result[0]["value"][1]) if result else None
        except Exception:
            return None

    def prom_label(expr: str, label: str) -> str | None:
        try:
            r = requests.get(
                f"{PROMETHEUS_URL.rstrip('/')}/api/v1/query",
                params={"query": expr},
                timeout=4,
            )
            result = r.json().get("data", {}).get("result", [])
            return result[0]["metric"].get(label) if result else None
        except Exception:
            return None

    # CPU 모델 — /host/proc 우선
    cpu_model = None
    for p in ("/host/proc/cpuinfo", "/proc/cpuinfo"):
        try:
            with open(p) as f:
                for line in f:
                    if line.startswith("model name"):
                        cpu_model = line.split(":", 1)[1].strip()
                        break
            if cpu_model:
                break
        except Exception:
            continue

    fs_q = 'node_filesystem_size_bytes{mountpoint="/"}'
    return {
        "cpu": {
            "model": cpu_model,
            "cores": int(prom("count(count(node_cpu_seconds_total) by (cpu))") or 0),
            "usage_pct": prom(
                '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
            ),
        },
        "memory": {
            "total_bytes": prom("node_memory_MemTotal_bytes"),
            "used_bytes": prom(
                "node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes"
            ),
        },
        "disk": {
            "total_bytes": prom(fs_q),
            "used_bytes": prom(
                fs_q + ' - node_filesystem_avail_bytes{mountpoint="/"}'
            ),
            "device": prom_label(fs_q, "device"),
            "fstype": prom_label(fs_q, "fstype"),
        },
        "host": {
            "hostname": prom_label("node_uname_info", "nodename"),
            "kernel": prom_label("node_uname_info", "release"),
            "arch": prom_label("node_uname_info", "machine"),
        },
    }


# ── 센서 (온도/팬/전력) — 물리 호스트 전용 ──────────────
def _sysfs_root() -> str:
    """호스트 sysfs 경로. /host/sys 우선 (docker bind), fallback /sys."""
    return "/host/sys" if os.path.exists("/host/sys") else "/sys"


def _read_int(path: str) -> int | None:
    try:
        with open(path) as f:
            return int(f.read().strip())
    except Exception:
        return None


def _read_str(path: str) -> str | None:
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return None


@router.get("/system/sensors")
def system_sensors() -> dict:
    """온도·팬·소비전력. VM 환경에선 available=false 응답.

    경로:
    - 온도: /sys/class/hwmon/hwmon*/temp*_input (milli-celsius)
    - 팬: /sys/class/hwmon/hwmon*/fan*_input (RPM)
    - 전력: /sys/class/powercap/intel-rapl:*/energy_uj (마이크로줄, microjoule)
    """
    root = _sysfs_root()
    import glob
    import time

    temps: list[dict] = []
    fans: list[dict] = []
    for hwmon_dir in sorted(glob.glob(f"{root}/class/hwmon/hwmon*")):
        chip = _read_str(f"{hwmon_dir}/name") or os.path.basename(hwmon_dir)
        for temp_file in sorted(glob.glob(f"{hwmon_dir}/temp*_input")):
            milli_c = _read_int(temp_file)
            if milli_c is None:
                continue
            idx = os.path.basename(temp_file).replace("temp", "").replace("_input", "")
            label = _read_str(temp_file.replace("_input", "_label")) or f"temp{idx}"
            temps.append({"chip": chip, "label": label, "celsius": milli_c / 1000.0})
        for fan_file in sorted(glob.glob(f"{hwmon_dir}/fan*_input")):
            rpm = _read_int(fan_file)
            if rpm is None:
                continue
            idx = os.path.basename(fan_file).replace("fan", "").replace("_input", "")
            label = _read_str(fan_file.replace("_input", "_label")) or f"fan{idx}"
            fans.append({"chip": chip, "label": label, "rpm": rpm})

    # 전력 — RAPL energy 카운터 1초 간격 2회 측정 후 차분 → 와트
    rapl_paths = sorted(glob.glob(f"{root}/class/powercap/intel-rapl:*/energy_uj"))
    power: list[dict] = []
    if rapl_paths:
        readings_1 = {p: _read_int(p) for p in rapl_paths}
        time.sleep(1.0)
        readings_2 = {p: _read_int(p) for p in rapl_paths}
        for p in rapl_paths:
            v1 = readings_1.get(p)
            v2 = readings_2.get(p)
            if v1 is None or v2 is None:
                continue
            domain_dir = os.path.dirname(p)
            name = _read_str(f"{domain_dir}/name") or os.path.basename(domain_dir)
            # 1초 간격 마이크로줄 차분 → 와트 (µJ/s = µW, ÷1e6 = W)
            delta_uj = (v2 - v1) % (2**63)
            watts = delta_uj / 1_000_000.0
            power.append({"domain": name, "watts": round(watts, 2)})

    available = bool(temps or fans or power)
    return {
        "available": available,
        "reason": None if available else "VM 환경 — host RAPL/hwmon 접근 불가",
        "temps": temps,
        "fans": fans,
        "power": power,
    }


# ── 네트워크 정보 ───────────────────────────────────────
@router.get("/system/network")
def system_network() -> dict:
    """호스트 네트워크 인터페이스 + 공인 IP. Prometheus node-exporter 메트릭 기반."""
    interfaces: list[dict] = []
    if requests:
        try:
            r = requests.get(
                f"{PROMETHEUS_URL.rstrip('/')}/api/v1/query",
                params={"query": "node_network_info"},
                timeout=4,
            )
            for s in r.json().get("data", {}).get("result", []):
                m = s.get("metric", {})
                name = m.get("device")
                if not name or name == "lo":
                    continue
                interfaces.append({
                    "name": name,
                    "state": m.get("operstate", "?"),
                    "addr": m.get("address", ""),  # MAC
                })
            # IP 주소 추가 매핑 (node_network_address_info 가 있다면)
            r2 = requests.get(
                f"{PROMETHEUS_URL.rstrip('/')}/api/v1/query",
                params={"query": "node_network_address_info"},
                timeout=4,
            )
            ip_map: dict[str, list[str]] = {}
            for s in r2.json().get("data", {}).get("result", []):
                m = s.get("metric", {})
                dev = m.get("device")
                ip = m.get("address")
                if dev and ip and ":" not in ip:  # IPv4 만
                    ip_map.setdefault(dev, []).append(ip)
            for i in interfaces:
                ips = ip_map.get(i["name"], [])
                if ips:
                    i["addr"] = ips[0]
        except Exception:
            pass

    public_ip = None
    if requests:
        try:
            r = requests.get("https://api.ipify.org", timeout=3)
            if r.status_code == 200:
                public_ip = r.text.strip()
        except Exception:
            pass

    return {"interfaces": interfaces, "public_ip": public_ip}


# ── 스토리지 정보 (inode + 파일시스템) ────────────────────
@router.get("/system/storage")
def system_storage() -> dict:
    """파일시스템 사이즈/사용량/inode/타입 통합."""
    if requests is None:
        return {"filesystems": []}
    fs_q = 'node_filesystem_size_bytes{mountpoint=~"/|/boot"}'
    inode_q = 'node_filesystem_files{mountpoint=~"/|/boot"}'

    def query(expr: str) -> list[dict]:
        try:
            r = requests.get(
                f"{PROMETHEUS_URL.rstrip('/')}/api/v1/query",
                params={"query": expr}, timeout=4,
            )
            return r.json().get("data", {}).get("result", [])
        except Exception:
            return []

    fs_size = {s["metric"].get("mountpoint"): s for s in query(fs_q)}
    fs_avail = {s["metric"].get("mountpoint"): s for s in query(
        'node_filesystem_avail_bytes{mountpoint=~"/|/boot"}'
    )}
    fs_inode = {s["metric"].get("mountpoint"): s for s in query(inode_q)}
    fs_inode_free = {s["metric"].get("mountpoint"): s for s in query(
        'node_filesystem_files_free{mountpoint=~"/|/boot"}'
    )}

    filesystems = []
    for mp, item in fs_size.items():
        meta = item["metric"]
        total = float(item["value"][1])
        avail = float(fs_avail[mp]["value"][1]) if mp in fs_avail else 0
        used = total - avail
        inodes = float(fs_inode[mp]["value"][1]) if mp in fs_inode else 0
        inode_free = float(fs_inode_free[mp]["value"][1]) if mp in fs_inode_free else 0
        inode_used = inodes - inode_free
        filesystems.append({
            "mountpoint": mp,
            "device": meta.get("device"),
            "fstype": meta.get("fstype"),
            "total_bytes": total,
            "used_bytes": used,
            "avail_bytes": avail,
            "use_pct": (used / total * 100) if total else 0,
            "inodes_total": inodes,
            "inodes_used": inode_used,
            "inodes_use_pct": (inode_used / inodes * 100) if inodes else 0,
        })
    return {"filesystems": filesystems}


# ── 포트 / Listen 서비스 ────────────────────────────────
def _parse_proc_net(_path: str, proto: str) -> list[dict]:
    """호스트 listen 포트 — PID 1 (systemd) 의 netns 를 통해 호스트 view 획득."""
    candidates = [
        f"/host/proc/1/net/{proto}",  # 호스트 systemd PID 1 의 netns view
        f"/host/proc/net/{proto}",
        f"/proc/net/{proto}",
    ]
    path = next((p for p in candidates if os.path.exists(p)), candidates[-1])
    rows = []
    try:
        with open(path) as f:
            next(f)  # 헤더
            for line in f:
                parts = line.split()
                if len(parts) < 4:
                    continue
                local = parts[1]
                state = parts[3]
                # TCP LISTEN = 0A, UDP UNCONN = 07
                is_listen = (proto == "tcp" and state == "0A") or proto == "udp"
                if not is_listen:
                    continue
                hex_ip, hex_port = local.split(":")
                port = int(hex_port, 16)
                if len(hex_ip) == 8:  # IPv4 little-endian hex
                    ip_bytes = [int(hex_ip[i : i + 2], 16) for i in range(0, 8, 2)]
                    ip = ".".join(str(b) for b in reversed(ip_bytes))
                else:
                    ip = "::"
                rows.append({
                    "proto": proto,
                    "state": "LISTEN" if proto == "tcp" else "UNCONN",
                    "addr": ip,
                    "port": str(port),
                })
    except Exception:
        pass
    return rows


@router.get("/system/ports")
def system_ports() -> dict:
    """호스트 listen TCP/UDP 포트. /host/proc/net 우선."""
    listening = _parse_proc_net("", "tcp")
    listening += _parse_proc_net("", "udp")
    listening.sort(key=lambda x: (x["proto"], int(x["port"])))
    return {"listening": listening}


# ── LLM (Ollama) ────────────────────────────────────────
@router.get("/llm/health")
def llm_health() -> dict:
    """Ollama 가동 여부 + gemma4 설치 여부 응답."""
    if requests is None:
        return {"ollama_up": False, "ready": False, "error": "requests missing"}
    try:
        r = requests.get(f"{OLLAMA_URL.rstrip('/')}/api/tags", timeout=4)
        if r.status_code != 200:
            return {"ollama_up": False, "ready": False, "code": r.status_code}
        tags = [m.get("name", "") for m in r.json().get("models", [])]
        ready = OLLAMA_MODEL in tags
        return {
            "ollama_up": True,
            "models": tags,
            "required": OLLAMA_MODEL,
            "ready": ready,
            "pull_cmd": (
                f"docker exec intelligence-ollama ollama pull {OLLAMA_MODEL}"
                if not ready
                else None
            ),
        }
    except Exception as e:
        return {"ollama_up": False, "ready": False, "error": str(e)[:160]}


@router.post("/llm/analyze-alert")
def llm_analyze_alert(body: dict) -> dict:
    """단일 알람을 컨텍스트로 받아 구조화된 분석 보고서 생성.

    body: { alert: { detector, verdict, ip, score, attack, signals, ... } }
    """
    if requests is None:
        raise HTTPException(503, "requests not available")

    alert = body.get("alert")
    if not isinstance(alert, dict):
        raise HTTPException(400, "alert object required")

    import json as _json
    alert_json = _json.dumps(alert, ensure_ascii=False, indent=2, default=str)[:4000]

    system = (
        "당신은 SIEM-Trinity 의 보안 분석 전문가입니다. "
        "주어진 알람을 분석해 한국어로 다음 4개 섹션을 구조화해 답하세요:\n"
        "1. **요약** — 무슨 일이 일어났는지 1~2문장\n"
        "2. **공격 체인** — MITRE ATT&CK 기술 매핑 (Tactic/Technique ID 포함)\n"
        "3. **위험 평가** — 영향 범위·심각도 근거\n"
        "4. **권장 대응** — 즉시·단기·장기 액션 (구체 명령 우선)\n"
        "근거 없는 추측 금지. 신호가 부족하면 '추가 조사 필요' 라고 명시."
    )
    user_msg = f"분석할 알람:\n```json\n{alert_json}\n```"

    try:
        r = requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                "stream": False,
                "options": {"temperature": 0.2},
            },
            timeout=180,
        )
        if r.status_code != 200:
            raise HTTPException(502, f"ollama {r.status_code}: {r.text[:200]}")
        return {
            "analysis": r.json().get("message", {}).get("content", ""),
            "model": r.json().get("model"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"analyze failed: {e}") from e


@router.post("/llm/chat")
def llm_chat(body: dict) -> dict:
    """단순 채팅 — Ollama /api/chat 프록시.

    body: {messages: [{role: 'user'|'assistant'|'system', content: '...'}], ...}
    """
    if requests is None:
        raise HTTPException(503, "requests not available")

    messages = body.get("messages") or []
    if not messages:
        raise HTTPException(400, "messages required")

    try:
        r = requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/chat",
            json={
                "model": body.get("model") or OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "options": {"temperature": float(body.get("temperature", 0.3))},
            },
            timeout=120,
        )
        if r.status_code != 200:
            raise HTTPException(502, f"ollama {r.status_code}: {r.text[:200]}")
        data = r.json()
        return {
            "content": data.get("message", {}).get("content", ""),
            "model": data.get("model"),
            "eval_count": data.get("eval_count"),
            "eval_duration": data.get("eval_duration"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"ollama chat failed: {e}") from e


# ── Prometheus / Loki 메트릭 쿼리 (TrinitySOC Overview 용) ──
@router.get("/metric/prom/instant")
def prom_instant(expr: str = Query(..., description="PromQL")) -> dict:
    """단일 PromQL instant value."""
    if requests is None:
        raise HTTPException(503, "requests not available")
    try:
        r = requests.get(
            f"{PROMETHEUS_URL.rstrip('/')}/api/v1/query",
            params={"query": expr},
            timeout=5,
        )
        if r.status_code != 200:
            return {"value": None, "error": f"prom {r.status_code}"}
        result = r.json().get("data", {}).get("result", [])
        if not result:
            return {"value": None}
        return {"value": float(result[0]["value"][1])}
    except Exception as e:
        return {"value": None, "error": str(e)[:120]}


@router.get("/metric/prom/range")
def prom_range(
    expr: str = Query(...),
    minutes: int = Query(60, ge=1, le=720),
    step: int = Query(60, ge=5, le=3600),
) -> dict:
    """PromQL range — 시계열 차트용."""
    if requests is None:
        raise HTTPException(503, "requests not available")
    import time
    end = int(time.time())
    start = end - minutes * 60
    try:
        r = requests.get(
            f"{PROMETHEUS_URL.rstrip('/')}/api/v1/query_range",
            params={"query": expr, "start": start, "end": end, "step": step},
            timeout=10,
        )
        if r.status_code != 200:
            return {"series": [], "error": f"prom {r.status_code}"}
        data = r.json().get("data", {}).get("result", [])
        series = [
            {
                "labels": s.get("metric", {}),
                "points": [(int(t), float(v)) for t, v in s.get("values", [])],
            }
            for s in data
        ]
        return {"series": series}
    except Exception as e:
        return {"series": [], "error": str(e)[:120]}


@router.get("/metric/loki/instant")
def loki_instant(expr: str = Query(..., description="LogQL metric expr")) -> dict:
    """단일 LogQL aggregated value (count_over_time 등)."""
    if requests is None:
        raise HTTPException(503, "requests not available")
    import time
    try:
        r = requests.get(
            f"{LOKI_URL.rstrip('/')}/loki/api/v1/query",
            params={"query": expr, "time": int(time.time() * 1_000_000_000)},
            timeout=10,
        )
        if r.status_code != 200:
            return {"value": None, "error": f"loki {r.status_code}"}
        result = r.json().get("data", {}).get("result", [])
        if not result:
            return {"value": 0.0}
        total = sum(float(s["value"][1]) for s in result)
        return {"value": total, "samples": len(result)}
    except Exception as e:
        return {"value": None, "error": str(e)[:120]}


@router.get("/metric/loki/range")
def loki_range(
    expr: str = Query(...),
    minutes: int = Query(60, ge=1, le=720),
    step: int = Query(60, ge=5, le=3600),
) -> dict:
    """LogQL range — 시계열 차트용."""
    if requests is None:
        raise HTTPException(503, "requests not available")
    import time
    end = int(time.time() * 1_000_000_000)
    start = end - minutes * 60 * 1_000_000_000
    try:
        r = requests.get(
            f"{LOKI_URL.rstrip('/')}/loki/api/v1/query_range",
            params={"query": expr, "start": start, "end": end, "step": f"{step}s"},
            timeout=15,
        )
        if r.status_code != 200:
            return {"series": [], "error": f"loki {r.status_code}"}
        data = r.json().get("data", {}).get("result", [])
        series = [
            {
                "labels": s.get("metric", s.get("stream", {})),
                "points": [(int(t), float(v)) for t, v in s.get("values", [])],
            }
            for s in data
        ]
        return {"series": series}
    except Exception as e:
        return {"series": [], "error": str(e)[:120]}


@router.get("/metric/loki/topk")
def loki_topk(
    expr: str = Query(..., description="topk wrapped LogQL"),
    minutes: int = Query(1440, ge=1, le=10080),
) -> dict:
    """Loki topk metric → 라벨별 값 정렬 리스트."""
    if requests is None:
        raise HTTPException(503, "requests not available")
    import time
    try:
        r = requests.get(
            f"{LOKI_URL.rstrip('/')}/loki/api/v1/query",
            params={"query": expr, "time": int(time.time() * 1_000_000_000)},
            timeout=15,
        )
        if r.status_code != 200:
            return {"rows": [], "error": f"loki {r.status_code}"}
        data = r.json().get("data", {}).get("result", [])
        rows = [
            {"labels": s.get("metric", {}), "value": float(s["value"][1])}
            for s in data
        ]
        rows.sort(key=lambda x: x["value"], reverse=True)
        return {"rows": rows}
    except Exception as e:
        return {"rows": [], "error": str(e)[:120]}


# ── TheHive ─────────────────────────────────────────────
@router.get("/cases")
def list_cases(limit: int = Query(50, ge=1, le=200)) -> dict:
    """최근 TheHive 케이스 목록."""
    items = thehive_client.list_cases(limit=limit)
    normalized = [
        {
            "id": c.get("_id") or c.get("id"),
            "number": c.get("number"),
            "title": c.get("title"),
            "severity": c.get("severity"),
            "status": c.get("status"),
            "tlp": c.get("tlp"),
            "tags": c.get("tags", []),
            "createdAt": c.get("_createdAt") or c.get("createdAt"),
            "owner": c.get("owner") or c.get("assignee"),
        }
        for c in items
    ]
    return {"total": len(normalized), "cases": normalized}


# ── 쓰기 액션 (Alerts 모달 3버튼) ────────────────────────
# ACTIONS_API_KEY 환경변수가 설정되어 있으면 X-API-Key 헤더 검증 강제.
# CSRF 방어의 1차선 (CORS 제한 + 명시 헤더). 운영 시 필수.
from fastapi import Depends  # noqa: E402

@router.post("/actions/case", dependencies=[Depends(require_actions_key)])
def action_create_case(body: dict) -> dict:
    """TheHive 케이스 즉시 생성."""
    title = body.get("title") or "Manual case from TrinitySOC"
    description = body.get("description") or ""
    # TrinitySOC severity (1-4) → verdict 이름 매핑
    sev = int(body.get("severity") or 2)
    verdict = {1: "Low", 2: "Medium", 3: "High", 4: "Critical"}.get(sev, "Medium")
    tags = body.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    result = thehive_client.create_case(
        title=str(title)[:200],
        description=str(description)[:8000],
        verdict=verdict,
        tags=tags,
    )
    return result if isinstance(result, dict) else {"created": False, "raw": str(result)}


@router.post("/actions/ban", dependencies=[Depends(require_actions_key)])
def action_ban_ip(body: dict) -> dict:
    """fail2ban 자동차단 즉시 실행 (위험점수 무관 강제 호출)."""
    ip = body.get("ip")
    if not ip:
        raise HTTPException(400, "ip required")
    score = int(body.get("score") or 95)  # manual은 critical로 간주
    signals = body.get("signals") or {}
    return auto_ban.auto_ban(ip=str(ip), score=score, signals=signals)


@router.get("/cases/{case_id}")
def get_case(case_id: str) -> dict:
    case = thehive_client.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="case not found")
    return case


# ── MISP ────────────────────────────────────────────────
@router.get("/intel/lookup/{ip}")
def intel_lookup(ip: str) -> dict:
    """단일 IP/도메인의 MISP IOC 매칭 결과."""
    return {"ip": ip, **misp_client.lookup_ip(ip)}


# ── Loki ────────────────────────────────────────────────
@router.get("/logs/query", dependencies=[Depends(require_actions_key)])
def logs_query(
    q: str = Query(..., description="LogQL 표현식"),
    minutes: int = Query(15, ge=1, le=10080),
    limit: int = Query(200, ge=1, le=1000),
) -> dict:
    """Loki query_range 프록시 — 최근 N분 / 최대 1000건."""
    if requests is None:
        raise HTTPException(status_code=503, detail="requests not available")

    import time

    end = int(time.time() * 1_000_000_000)
    start = end - minutes * 60 * 1_000_000_000

    try:
        resp = requests.get(
            f"{LOKI_URL.rstrip('/')}/loki/api/v1/query_range",
            params={
                "query": q,
                "start": start,
                "end": end,
                "limit": limit,
                "direction": "backward",
            },
            timeout=10,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"loki {resp.status_code}")
        data = resp.json().get("data", {})
        # Loki streams → TrinitySOC 친화 평탄화
        rows: list[dict[str, Any]] = []
        for stream in data.get("result", []):
            labels = stream.get("stream", {})
            for ts_ns, line in stream.get("values", []):
                rows.append({"ts": ts_ns, "labels": labels, "line": line})
        rows.sort(key=lambda r: r["ts"], reverse=True)
        return {"total": len(rows), "rows": rows[:limit]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"loki query failed: {e}") from e


# ── Health (모든 의존 서비스) ────────────────────────────
@router.get("/health/all")
def health_all() -> dict:
    """TrinitySOC 헤더에 표시할 의존 서비스 헬스 일괄 응답."""
    checks: dict[str, dict[str, Any]] = {}

    def _check(name: str, url: str, ok_codes: tuple[int, ...] = (200,)) -> None:
        if requests is None:
            checks[name] = {"url": url, "status": "unknown", "code": None}
            return
        try:
            r = requests.get(url, timeout=3, verify=False)
            checks[name] = {
                "url": url,
                "status": "ok" if r.status_code in ok_codes else "warn",
                "code": r.status_code,
            }
        except Exception as e:
            checks[name] = {"url": url, "status": "down", "code": None, "error": str(e)[:120]}

    _check("loki", f"{LOKI_URL.rstrip('/')}/ready")
    thehive_url = os.getenv("THEHIVE_URL", "")
    if thehive_url:
        _check("thehive", thehive_url, ok_codes=(200, 302))
    misp_url = os.getenv("MISP_URL", "")
    if misp_url:
        _check("misp", misp_url, ok_codes=(200, 302, 401, 403))
    ollama_url = os.getenv("OLLAMA_URL", "http://intelligence-ollama:11434")
    _check("ollama", f"{ollama_url.rstrip('/')}/api/tags")

    return {"services": checks}
