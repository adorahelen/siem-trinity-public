"""
SIEM AI Detector — FastAPI 백엔드

- 경보 조회 / 요약 API
- 탐지기 즉시 실행 (POST /api/run)
- APScheduler 30분 주기 자동 실행
- React SPA 정적 파일 서빙
"""
import asyncio
import json
import sys
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

# 탐지기 모듈을 /app 기준으로 임포트
sys.path.insert(0, str(Path(__file__).parent.parent))

import run_all as _run_all_module
from config import ALERT_LOG_PATH

# ── 상태 관리 ────────────────────────────────────────────
_state: dict = {
    "is_running": False,
    "last_run": None,        # datetime
    "last_run_result": None, # dict
    "next_run": None,        # datetime (naive)
    "error": None,
}

SCHEDULE_MINUTES = 30
_executor = ThreadPoolExecutor(max_workers=1)
_scheduler = AsyncIOScheduler()


# ── 탐지기 실행 로직 ─────────────────────────────────────

def _run_sync(hours: float = 1.0) -> dict:
    """스레드풀에서 동기 실행 (run_all 호출)."""
    started = datetime.now()
    results = _run_all_module.run_all(hours=hours, output_json=False)
    elapsed = int((datetime.now() - started).total_seconds())
    return {
        "beacons": len(results.get("beacons", [])),
        "dga_domains": len(results.get("dga_domains", [])),
        "flow_anomalies": len(results.get("flow_anomalies", [])),
        "ip_scores": len(results.get("ip_scores", [])),
        "elapsed_seconds": elapsed,
        "timestamp": started.isoformat(),
    }


async def _execute():
    """스케줄러 / 즉시 실행 공통 진입점."""
    if _state["is_running"]:
        return
    _state["is_running"] = True
    _state["error"] = None
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_executor, lambda: _run_sync(hours=1.0))
        _state["last_run"] = datetime.now()
        _state["last_run_result"] = result
        # 다음 실행 시간 갱신
        job = _scheduler.get_job("periodic")
        if job and job.next_run_time:
            _state["next_run"] = job.next_run_time.replace(tzinfo=None)
    except Exception as exc:
        _state["error"] = str(exc)
    finally:
        _state["is_running"] = False


# ── FastAPI 앱 ───────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 스케줄러 시작
    _scheduler.add_job(
        _execute,
        trigger=IntervalTrigger(minutes=SCHEDULE_MINUTES),
        id="periodic",
        replace_existing=True,
    )
    _scheduler.start()
    job = _scheduler.get_job("periodic")
    if job and job.next_run_time:
        _state["next_run"] = job.next_run_time.replace(tzinfo=None)
    yield
    _scheduler.shutdown(wait=False)


app = FastAPI(title="SIEM AI Detector", lifespan=lifespan)

# CORS — Tailscale + LAN 운영 환경에 맞춰 명시 화이트리스트.
# CORS_ALLOWED_ORIGINS env (콤마 구분) 로 추가 origin 지정 가능.
# "*" 는 운영에서 사용 금지 (CSRF 표면 확장). 강제 호환 필요 시 env 로 "*" 지정.
import os as _os  # noqa: E402
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_extra = _os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
_origins = [o.strip() for o in _extra.split(",") if o.strip()] if _extra else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# TrinitySOC 통합 콘솔용 BFF 라우터
from api.bff import router as bff_router  # noqa: E402
app.include_router(bff_router)


# ── API 엔드포인트 ───────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def get_status():
    def _fmt(dt):
        return dt.isoformat() if dt else None

    # XDR 활성화 토글 4종 + 외부 UI base URL — UI 가 chip/링크 렌더링에 사용
    from config import (
        AUTO_BAN_ENABLED, AUTO_BAN_THRESHOLD,
        MISP_ENABLED, MISP_URL,
        SHUFFLE_ENABLED, SHUFFLE_WEBHOOK_URL,
        THEHIVE_ENABLED, THEHIVE_URL,
    )
    # docker network 내부 호스트명을 외부 노출용 base URL 로 환원 (옵션)
    import os
    thehive_public = os.getenv("THEHIVE_PUBLIC_URL", "")     # 예: http://192.168.10.232:9000

    return {
        "is_running": _state["is_running"],
        "last_run": _fmt(_state["last_run"]),
        "last_run_result": _state["last_run_result"],
        "next_run": _fmt(_state["next_run"]),
        "schedule_interval_minutes": SCHEDULE_MINUTES,
        "error": _state["error"],
        "xdr": {
            "auto_ban": {"enabled": AUTO_BAN_ENABLED, "threshold": AUTO_BAN_THRESHOLD},
            "misp":     {"enabled": MISP_ENABLED,     "url": MISP_URL},
            "shuffle":  {"enabled": SHUFFLE_ENABLED,  "webhook_set": bool(SHUFFLE_WEBHOOK_URL)},
            "thehive":  {"enabled": THEHIVE_ENABLED,  "url": THEHIVE_URL, "public_url": thehive_public},
        },
    }


@app.post("/api/run")
async def trigger_run():
    if _state["is_running"]:
        raise HTTPException(status_code=409, detail="이미 실행 중입니다")
    asyncio.create_task(_execute())
    return {"message": "탐지기 실행 시작됨"}


def _load_alerts(date_str: Optional[str] = None) -> list[dict]:
    target = date_str or datetime.now().strftime("%Y-%m-%d")
    path = ALERT_LOG_PATH / f"alerts_{target}.jsonl"
    if not path.exists():
        return []
    alerts = []
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        alerts.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    except OSError:
        pass
    return alerts


def _build_summary(alerts: list[dict], date_str: str) -> dict:
    by_detector: dict = {}
    by_verdict: dict = {}
    hourly: dict = {}
    heatmap: dict = {}   # {"HH": {"Critical": N, ...}}
    for a in alerts:
        d = a.get("detector", "unknown")
        v = a.get("verdict", "unknown")
        by_detector[d] = by_detector.get(d, 0) + 1
        by_verdict[v] = by_verdict.get(v, 0) + 1
        ts = a.get("timestamp", "")
        if len(ts) >= 13:
            h = ts[11:13]
            hourly[h] = hourly.get(h, 0) + 1
            if h not in heatmap:
                heatmap[h] = {}
            heatmap[h][v] = heatmap[h].get(v, 0) + 1
    return {
        "date": date_str,
        "total": len(alerts),
        "by_detector": by_detector,
        "by_verdict": by_verdict,
        "hourly": hourly,
        "heatmap": heatmap,
    }


@app.get("/api/summary")
async def get_summary(date: Optional[str] = None):
    target = date or datetime.now().strftime("%Y-%m-%d")
    alerts = _load_alerts(date)
    summary = _build_summary(alerts, target)

    def _fmt(dt):
        return dt.isoformat() if dt else None

    from config import (
        AUTO_BAN_ENABLED, AUTO_BAN_THRESHOLD,
        MISP_ENABLED, SHUFFLE_ENABLED,
        THEHIVE_ENABLED, THEHIVE_URL,
    )
    import os
    summary["status"] = {
        "is_running": _state["is_running"],
        "last_run": _fmt(_state["last_run"]),
        "next_run": _fmt(_state["next_run"]),
        "error": _state["error"],
        "xdr": {
            "auto_ban": AUTO_BAN_ENABLED,
            "auto_ban_threshold": AUTO_BAN_THRESHOLD,
            "misp": MISP_ENABLED,
            "shuffle": SHUFFLE_ENABLED,
            "thehive": THEHIVE_ENABLED,
            "thehive_public_url": os.getenv("THEHIVE_PUBLIC_URL", ""),
        },
    }
    return summary


@app.get("/api/compare")
async def get_compare(date1: str, date2: Optional[str] = None):
    d2 = date2 or datetime.now().strftime("%Y-%m-%d")
    alerts1 = _load_alerts(date1)
    alerts2 = _load_alerts(d2)
    return {
        "date1": _build_summary(alerts1, date1),
        "date2": _build_summary(alerts2, d2),
    }


@app.get("/api/alerts")
async def get_alerts(
    date: Optional[str] = None,
    detector: Optional[str] = None,
    verdict: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    alerts = _load_alerts(date)
    if detector:
        alerts = [a for a in alerts if a.get("detector") == detector]
    if verdict:
        alerts = [a for a in alerts if a.get("verdict") == verdict]
    total = len(alerts)
    start = (page - 1) * limit
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "alerts": alerts[start: start + limit],
    }


def _load_alerts_range(days: int) -> list[dict]:
    """최근 N일 의 모든 alerts_*.jsonl 합쳐 반환."""
    from datetime import timedelta
    out: list[dict] = []
    today = datetime.now().date()
    for i in range(days):
        d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        out.extend(_load_alerts(d))
    return out


VERDICT_SCORE_MAP = {"Low": 1, "Medium": 2, "High": 3, "Danger": 3, "Critical": 4}


@app.get("/api/attack/coverage")
async def attack_coverage(days: int = Query(7, ge=1, le=90)):
    """
    최근 N일의 alerts 에서 ATT&CK technique 발화를 집계 →
    MITRE ATT&CK Navigator (https://mitre-attack.github.io/attack-navigator/) layer JSON 반환.

    사용:
        curl http://HOST:2027/api/attack/coverage?days=7 > coverage.json
        → Navigator 의 'Open Existing Layer' 에 import
    """
    alerts = _load_alerts_range(days)

    # technique 별 집계: count + 최고 verdict
    by_tech: dict[str, dict] = {}
    for a in alerts:
        techs = a.get("attack") or []
        verdict = a.get("verdict", "Low")
        score = VERDICT_SCORE_MAP.get(verdict, 1)
        for t in techs:
            cur = by_tech.setdefault(t, {"count": 0, "max_verdict": "Low", "max_score": 0})
            cur["count"] += 1
            if score > cur["max_score"]:
                cur["max_score"] = score
                cur["max_verdict"] = verdict

    # Navigator layer JSON 4.5 spec (간소)
    techniques_payload = []
    for tid, info in by_tech.items():
        # 색상: Low=#3fb950 Medium=#1f6feb High=#d29922 Critical=#f85149
        color = {
            "Low": "#3fb950", "Medium": "#1f6feb",
            "High": "#d29922", "Danger": "#db61a2", "Critical": "#f85149",
        }.get(info["max_verdict"], "#8b949e")
        techniques_payload.append({
            "techniqueID": tid,
            "score": info["count"],
            "color": color,
            "comment": f"verdict={info['max_verdict']}, count={info['count']}",
            "enabled": True,
        })

    return {
        "name": f"SIEM-Trinity coverage ({days}d)",
        "versions": {"attack": "16", "navigator": "5.1.0", "layer": "4.5"},
        "domain": "enterprise-attack",
        "description": f"02-detection alerts 의 ATT&CK 발화 ({len(alerts)} alerts / {len(by_tech)} techniques / {days} days)",
        "filters": {"platforms": ["Linux", "Network"]},
        "techniques": techniques_payload,
        "gradient": {"colors": ["#ffffff", "#f85149"], "minValue": 1, "maxValue": max((t["score"] for t in techniques_payload), default=1)},
        "legendItems": [
            {"color": "#3fb950", "label": "Low"},
            {"color": "#1f6feb", "label": "Medium"},
            {"color": "#d29922", "label": "High"},
            {"color": "#db61a2", "label": "Danger"},
            {"color": "#f85149", "label": "Critical"},
        ],
        # UI 용 부속 정보
        "_summary": {
            "alerts_count": len(alerts),
            "techniques_count": len(by_tech),
            "days": days,
            "top_techniques": sorted(
                [{"id": tid, **info} for tid, info in by_tech.items()],
                key=lambda x: -x["count"],
            )[:20],
        },
    }


@app.get("/api/history")
async def get_history():
    dates = []
    if ALERT_LOG_PATH.exists():
        for f in sorted(ALERT_LOG_PATH.glob("alerts_*.jsonl"), reverse=True):
            date_str = f.stem.replace("alerts_", "")
            try:
                count = sum(1 for _ in open(f))
            except OSError:
                count = 0
            dates.append({"date": date_str, "count": count})
    return {"dates": dates}


# detection-api 는 이제 백엔드 BFF 전용.
# 옛 02-detection/ui/ React SPA 는 04-ui/ (TrinitySOC) 로 이관됨.
