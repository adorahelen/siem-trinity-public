"""
네트워크 흐름 이상탐지기 (Flow Anomaly Detector)
Zeek conn 로그 수치 피처 기반 Isolation Forest 비지도 학습.

실행: bash run.sh flow_anomaly_detector.py [--hours 1] [--retrain]
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from rich.console import Console
from rich.table import Table
from rich import box

from config import FLOW_CONTAMINATION, MODELS_PATH, is_internal_ip
from loki_client import get_zeek_conn, parse_json_line
from alert_manager import send_alert

console = Console()

MODEL_PATH = MODELS_PATH / "isolation_forest.pkl"
SCALER_PATH = MODELS_PATH / "scaler.pkl"

# conn_state 인코딩 (Zeek 표준)
CONN_STATE_MAP = {
    "SF": 0,    # 정상 종료
    "S0": 1,    # SYN 보냈으나 응답 없음 (스캔)
    "REJ": 2,   # 연결 거부
    "RSTO": 3,  # RST로 종료 (발신측)
    "RSTR": 3,  # RST로 종료 (수신측)
    "SH": 4,    # SYN+FIN (비정상)
    "OTH": 5,   # 기타
    "S1": 0,    # 수립되었으나 미종료 (정상에 가까움)
    "S2": 4,    # SYN 후 재설정
    "S3": 4,
    "RSTOS0": 3,
    "RSTRH": 3,
}

PROTO_MAP = {"tcp": 0, "udp": 1, "icmp": 2}

FEATURES = ["orig_bytes", "resp_bytes", "orig_pkts", "resp_pkts",
            "duration", "dst_port", "proto_enc", "conn_state_enc"]


def _safe_float(val, default=0.0) -> float:
    try:
        return float(val) if val not in (None, "", "-") else default
    except (ValueError, TypeError):
        return default


def _safe_int(val, default=0) -> int:
    try:
        return int(float(val)) if val not in (None, "", "-") else default
    except (ValueError, TypeError):
        return default


def extract_flow_features(zeek_logs: list[dict]) -> pd.DataFrame:
    """Zeek conn 로그 → 피처 DataFrame 변환."""
    rows = []
    for entry in zeek_logs:
        # Promtail이 파싱한 labels에 이미 필드가 있음 (id_orig_h 등)
        labels = entry.get("labels", {})
        line_data = parse_json_line(entry.get("line", ""))

        # labels 우선, JSON line 보조
        def _get(*keys):
            for k in keys:
                v = labels.get(k) or line_data.get(k)
                if v and v not in ("-", ""):
                    return v
            return ""

        src_ip = _get("id_orig_h", "src_ip")
        dst_ip = _get("id_resp_h", "dst_ip")

        # IP 파싱 실패 또는 양측 모두 내부 IP면 제외
        if not src_ip and not dst_ip:
            continue
        if is_internal_ip(src_ip) and is_internal_ip(dst_ip):
            continue

        dst_port = _safe_int(_get("id_resp_p", "dst_port") or 0)
        proto = (_get("proto") or "tcp").lower()
        conn_state = _get("conn_state") or "OTH"

        # 수치 필드도 labels에서 가져오기
        def _gf(*keys):
            for k in keys:
                v = labels.get(k) or line_data.get(k)
                if v is not None and v not in ("-", ""):
                    return v
            return 0

        row = {
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "dst_port": dst_port,
            "proto": proto,
            "conn_state": conn_state,
            "orig_bytes": _safe_float(_gf("orig_bytes", "orig_ip_bytes")),
            "resp_bytes": _safe_float(_gf("resp_bytes", "resp_ip_bytes")),
            "orig_pkts": _safe_float(_gf("orig_pkts")),
            "resp_pkts": _safe_float(_gf("resp_pkts")),
            "duration": _safe_float(_gf("duration")),
            "proto_enc": PROTO_MAP.get(proto, 5),
            "conn_state_enc": CONN_STATE_MAP.get(conn_state, 5),
            "ts_ns": entry.get("timestamp", "0"),
        }
        rows.append(row)

    if not rows:
        return pd.DataFrame(columns=FEATURES + ["src_ip", "dst_ip", "dst_port",
                                                  "proto", "conn_state", "ts_ns"])
    return pd.DataFrame(rows)


def train_model(df: pd.DataFrame) -> tuple:
    """Isolation Forest 학습 후 models/ 에 저장. (model, scaler) 반환."""
    X = df[FEATURES].fillna(0).values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(
        contamination=FLOW_CONTAMINATION,
        n_estimators=100,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    console.print(f"[dim]모델 학습 완료 → {MODEL_PATH}[/dim]")
    return model, scaler


def load_or_train_model(df: pd.DataFrame) -> tuple:
    """저장된 모델 로드, 없으면 학습."""
    if MODEL_PATH.exists() and SCALER_PATH.exists():
        try:
            model = joblib.load(MODEL_PATH)
            scaler = joblib.load(SCALER_PATH)
            return model, scaler
        except Exception:
            pass
    return train_model(df)


def _classify_anomaly(row: pd.Series, df_stats: dict) -> str:
    """이상 유형 분류 (규칙 기반 후처리)."""
    conn_state = row.get("conn_state", "OTH")
    dst_port = int(row.get("dst_port", 0))
    orig_bytes = float(row.get("orig_bytes", 0))
    orig_pkts = float(row.get("orig_pkts", 0))

    mean_bytes = df_stats.get("mean_orig_bytes", 0)
    std_bytes = df_stats.get("std_orig_bytes", 1)

    if conn_state in ("S0", "REJ") and orig_pkts <= 2:
        return "포트스캔"
    if orig_bytes > mean_bytes + 3 * std_bytes and orig_bytes > 1_000_000:
        return "대용량 전송"
    if dst_port in (4444, 1337, 31337, 6666, 9001, 9030):
        return "알려진 C2 포트"
    return "네트워크 이상"


def detect_anomalies(hours: float = 1, retrain: bool = False) -> list[dict]:
    """최근 N시간 흐름 분석 후 이상 목록 반환."""
    logs = get_zeek_conn(hours=hours)
    if not logs:
        return []

    df = extract_flow_features(logs)
    if df.empty or len(df) < 10:
        return []

    if retrain:
        model, scaler = train_model(df)
    else:
        model, scaler = load_or_train_model(df)

    X = df[FEATURES].fillna(0).values
    X_scaled = scaler.transform(X)

    predictions = model.predict(X_scaled)      # -1: 이상, 1: 정상
    scores = model.score_samples(X_scaled)     # 낮을수록 이상

    df_stats = {
        "mean_orig_bytes": float(df["orig_bytes"].mean()),
        "std_orig_bytes": float(df["orig_bytes"].std()),
    }

    results = []
    anomaly_mask = predictions == -1
    anomaly_df = df[anomaly_mask].copy()
    anomaly_scores = scores[anomaly_mask]

    for i, (idx, row) in enumerate(anomaly_df.iterrows()):
        anomaly_type = _classify_anomaly(row, df_stats)
        score = float(anomaly_scores[i])
        verdict = "High" if score < -0.2 else "Medium"

        entry = {
            "src_ip": row["src_ip"],
            "dst_ip": row["dst_ip"],
            "dst_port": int(row["dst_port"]),
            "proto": row["proto"],
            "conn_state": row["conn_state"],
            "anomaly_score": round(score, 4),
            "orig_bytes": int(row["orig_bytes"]),
            "orig_pkts": int(row["orig_pkts"]),
            "anomaly_type": anomaly_type,
            "verdict": verdict,
            "message": (
                f"{row['src_ip']} → {row['dst_ip']}:{int(row['dst_port'])} | "
                f"{anomaly_type} | score={score:.3f}"
            ),
        }
        results.append(entry)

    results.sort(key=lambda x: x["anomaly_score"])
    return results[:50]  # 상위 50개만 반환


def run(hours: float = 1, retrain: bool = False):
    console.print(f"\n[bold cyan][ 흐름 이상탐지기 ][/bold cyan] 최근 {hours}시간 분석\n")

    anomalies = detect_anomalies(hours=hours, retrain=retrain)

    if not anomalies:
        console.print("[green]이상 흐름 없음[/green]\n")
        return

    table = Table(box=box.ROUNDED, show_header=True, header_style="bold magenta")
    table.add_column("판정", width=8)
    table.add_column("출발 IP", style="cyan")
    table.add_column("목적지", style="red")
    table.add_column("포트", justify="right")
    table.add_column("유형")
    table.add_column("Score", justify="right")
    table.add_column("Bytes", justify="right")

    verdict_colors = {"High": "bold orange3", "Medium": "yellow"}

    for a in anomalies:
        color = verdict_colors.get(a["verdict"], "white")
        table.add_row(
            f"[{color}]{a['verdict']}[/{color}]",
            a["src_ip"],
            a["dst_ip"],
            str(a["dst_port"]),
            a["anomaly_type"],
            str(a["anomaly_score"]),
            str(a["orig_bytes"]),
        )
        send_alert("flow_anomaly_detector", a["verdict"], a)

    console.print(table)
    console.print(f"\n[bold]총 {len(anomalies)}개 이상 흐름 탐지[/bold]\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="흐름 이상탐지기")
    parser.add_argument("--hours", type=float, default=1.0, help="분석 시간 범위 (기본 1시간)")
    parser.add_argument("--retrain", action="store_true", help="모델 재학습")
    args = parser.parse_args()
    run(hours=args.hours, retrain=args.retrain)
