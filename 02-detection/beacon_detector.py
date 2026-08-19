"""
비콘 탐지기 (Beacon Detector)
악성코드(RAT/C2)의 주기적 통신 패턴을 CoV + FFT로 탐지.

실행: bash run.sh beacon_detector.py [--hours 1]
"""
import argparse
from collections import defaultdict
from typing import Optional

import numpy as np
from rich.console import Console
from rich.table import Table
from rich import box

from config import BEACON_THRESHOLD_COV, BEACON_MIN_CONNECTIONS, is_internal_ip
from loki_client import get_zeek_conn, parse_json_line
from alert_manager import send_alert

console = Console()


def extract_connection_intervals(zeek_logs: list[dict]) -> dict:
    """
    (src_ip, dst_ip) 쌍별 연결 타임스탬프 → 간격 딕셔너리 반환.
    반환: {("1.2.3.4", "5.6.7.8"): [30.1, 29.8, 30.3, ...], ...}
    """
    # 쌍별 타임스탬프 수집
    ts_map: dict[tuple, list[float]] = defaultdict(list)

    for entry in zeek_logs:
        labels = entry.get("labels", {})
        line_data = parse_json_line(entry.get("line", ""))

        def _get(*keys):
            for k in keys:
                v = labels.get(k) or line_data.get(k)
                if v and v not in ("-", ""):
                    return v
            return ""

        src_ip = _get("id_orig_h", "src_ip")
        dst_ip = _get("id_resp_h", "dst_ip")

        if not src_ip or not dst_ip:
            continue
        if is_internal_ip(src_ip) and is_internal_ip(dst_ip):
            continue
        # 외부→내부, 내부→외부 모두 포함. 단, 내부 src는 C2 클라이언트로 의심
        if is_internal_ip(dst_ip):
            # 내부 목적지는 C2 후보 아님 (외부 dst만 추적)
            continue

        # Loki nanosecond timestamp → float seconds
        ts_ns = entry.get("timestamp", "0")
        try:
            ts_sec = int(ts_ns) / 1e9
        except ValueError:
            continue

        ts_map[(src_ip, dst_ip)].append(ts_sec)

    # 타임스탬프 → 간격 변환
    intervals_map: dict[tuple, list[float]] = {}
    for pair, timestamps in ts_map.items():
        if len(timestamps) < BEACON_MIN_CONNECTIONS:
            continue
        sorted_ts = sorted(timestamps)
        intervals = [sorted_ts[i+1] - sorted_ts[i] for i in range(len(sorted_ts)-1)]
        # 0초 간격(중복) 제거
        intervals = [iv for iv in intervals if iv > 0.5]
        if len(intervals) >= BEACON_MIN_CONNECTIONS - 1:
            intervals_map[pair] = intervals

    return intervals_map


def calculate_beacon_score(intervals: list[float]) -> dict:
    """
    CoV + FFT로 비콘 점수 계산.
    반환: {"cov": 0.05, "mean_interval": 30.2, "score": 95, "verdict": "Critical"}
    """
    arr = np.array(intervals)
    mean = float(np.mean(arr))
    std = float(np.std(arr))
    cov = std / mean if mean > 0 else 1.0

    # FFT 지배 주파수 강도 (선택적 강화)
    fft_score = 0.0
    if len(arr) >= 8:
        fft = np.abs(np.fft.rfft(arr - mean))
        if len(fft) > 1:
            dominant = float(fft[1:].max())
            total = float(fft[1:].sum())
            fft_score = dominant / total if total > 0 else 0.0

    # 점수 계산: CoV 낮을수록 + FFT 지배 주파수 강할수록 고점
    cov_score = max(0.0, 1.0 - cov / 0.5) * 80
    fft_boost = fft_score * 20
    score = min(100, int(cov_score + fft_boost))

    if cov < 0.1:
        verdict = "Critical"
    elif cov < 0.3:
        verdict = "High"
    elif cov < 0.5:
        verdict = "Medium"
    else:
        verdict = "Low"

    return {
        "cov": round(cov, 4),
        "mean_interval": round(mean, 2),
        "std_interval": round(std, 2),
        "fft_dominance": round(fft_score, 4),
        "score": score,
        "verdict": verdict,
    }


def detect_beacons(hours: float = 1) -> list[dict]:
    """
    최근 N시간 Zeek conn 분석 후 비콘 의심 IP 목록 반환.
    """
    logs = get_zeek_conn(hours=hours)
    if not logs:
        return []

    intervals_map = extract_connection_intervals(logs)
    results = []

    for (src_ip, dst_ip), intervals in intervals_map.items():
        result = calculate_beacon_score(intervals)
        if result["verdict"] == "Low":
            continue

        entry = {
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "connection_count": len(intervals) + 1,
            **result,
            "message": (
                f"{src_ip} → {dst_ip} | "
                f"연결 {len(intervals)+1}회 | "
                f"평균간격 {result['mean_interval']}초 | "
                f"CoV {result['cov']}"
            ),
        }
        results.append(entry)

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def run(hours: float = 1):
    console.print(f"\n[bold cyan][ 비콘 탐지기 ][/bold cyan] 최근 {hours}시간 분석\n")

    beacons = detect_beacons(hours=hours)

    if not beacons:
        console.print("[green]비콘 의심 통신 없음[/green]\n")
        return

    table = Table(box=box.ROUNDED, show_header=True, header_style="bold magenta")
    table.add_column("판정", width=8)
    table.add_column("출발 IP", style="cyan")
    table.add_column("목적지 IP", style="red")
    table.add_column("연결수", justify="right")
    table.add_column("평균간격(초)", justify="right")
    table.add_column("CoV", justify="right")
    table.add_column("점수", justify="right")

    verdict_colors = {
        "Critical": "bold red",
        "High": "bold orange3",
        "Medium": "yellow",
    }

    for b in beacons:
        color = verdict_colors.get(b["verdict"], "white")
        table.add_row(
            f"[{color}]{b['verdict']}[/{color}]",
            b["src_ip"],
            b["dst_ip"],
            str(b["connection_count"]),
            str(b["mean_interval"]),
            str(b["cov"]),
            str(b["score"]),
        )
        send_alert("beacon_detector", b["verdict"], b)

    console.print(table)
    console.print(f"\n[bold]총 {len(beacons)}개 비콘 의심 탐지[/bold]\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="비콘 탐지기")
    parser.add_argument("--hours", type=float, default=1.0, help="분석 시간 범위 (기본 1시간)")
    args = parser.parse_args()
    run(hours=args.hours)
