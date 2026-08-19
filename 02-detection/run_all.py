"""
전체 탐지기 통합 실행.
4개 탐지기를 순서대로 실행하고 종합 결과 출력.

실행: bash run.sh run_all.py [--hours 1] [--json]
"""
import argparse
import json
from datetime import datetime

from rich.console import Console
from rich.rule import Rule
from rich.panel import Panel

import beacon_detector
import dga_detector
import flow_anomaly_detector
import ip_risk_scorer
from alert_manager import load_today_alerts, send_alert

console = Console()


def run_all(hours: float = 1.0, output_json: bool = False):
    started_at = datetime.now()
    console.print(Panel(
        f"[bold cyan]SIEM AI Detector — 통합 탐지 실행[/bold cyan]\n"
        f"분석 범위: 최근 [bold]{hours}[/bold]시간  |  시작: {started_at.strftime('%Y-%m-%d %H:%M:%S')}",
        expand=False,
    ))

    results = {}

    # ── 1. 비콘 탐지 ────────────────────────────
    console.print(Rule("[cyan]1/4  비콘 탐지기[/cyan]"))
    beacons = beacon_detector.detect_beacons(hours=hours)
    beacon_detector.run(hours=hours)
    results["beacons"] = beacons

    # ── 2. DGA 탐지 ─────────────────────────────
    console.print(Rule("[cyan]2/4  DGA 탐지기[/cyan]"))
    dgas = dga_detector.detect_dga_domains(hours=hours)
    dga_detector.run(hours=hours)
    results["dga_domains"] = dgas

    # ── 3. 흐름 이상탐지 ─────────────────────────
    console.print(Rule("[cyan]3/4  흐름 이상탐지기[/cyan]"))
    anomalies = flow_anomaly_detector.detect_anomalies(hours=hours)
    flow_anomaly_detector.run(hours=hours)
    results["flow_anomalies"] = anomalies

    # ── 4. IP 위험도 스코어링 ────────────────────
    console.print(Rule("[cyan]4/4  IP 위험도 스코어러[/cyan]"))
    # 비콘/DGA 결과를 IP 스코어러에 연계
    beacon_ips = {b["dst_ip"] for b in beacons}
    dga_src_ips = {ip for d in dgas for ip in d.get("src_ips", [])}

    all_signals = ip_risk_scorer.collect_all_signals(hours=24)
    ip_results = []
    for ip, signals in all_signals.items():
        risk = ip_risk_scorer.calculate_risk_score(
            signals,
            beacon_hit=(ip in beacon_ips),
            dga_hit=(ip in dga_src_ips),
        )
        if risk["score"] == 0:
            continue
        entry = {
            "ip": ip, "score": risk["score"],
            "verdict": risk["verdict"],
            "breakdown": risk["breakdown"],
            "signals": signals,
            "message": f"{ip} 위험도:{risk['score']} ({risk['verdict']})",
        }
        ip_results.append(entry)
        if risk["verdict"] in ("Critical", "Danger", "High"):
            send_alert("ip_risk_scorer", risk["verdict"], entry)
    ip_results.sort(key=lambda x: x["score"], reverse=True)
    results["ip_scores"] = ip_results

    ip_risk_scorer.run(hours=24)

    # ── 종합 요약 ────────────────────────────────
    finished_at = datetime.now()
    elapsed = (finished_at - started_at).seconds

    console.print(Rule("[bold green]종합 결과[/bold green]"))
    console.print(f"""
[bold]분석 완료[/bold] — {finished_at.strftime('%Y-%m-%d %H:%M:%S')} (소요: {elapsed}초)

  비콘 의심    : [bold]{len(beacons)}[/bold]건
  DGA 의심     : [bold]{len(dgas)}[/bold]건
  이상 흐름    : [bold]{len(anomalies)}[/bold]건
  위험 IP 수   : [bold]{len(ip_results)}[/bold]개

오늘 누적 경보: [bold]{len(load_today_alerts())}[/bold]건
경보 저장 경로: reports/alerts_{started_at.strftime('%Y-%m-%d')}.jsonl
""")

    if output_json:
        # JSON 직렬화 가능하도록 변환
        def _serialize(obj):
            if isinstance(obj, set):
                return list(obj)
            return str(obj)

        print(json.dumps({
            "timestamp": started_at.isoformat(),
            "hours": hours,
            "summary": {
                "beacons": len(beacons),
                "dga_domains": len(dgas),
                "flow_anomalies": len(anomalies),
                "ip_scores": len(ip_results),
            },
            "top_ips": ip_results[:10],
        }, ensure_ascii=False, default=_serialize, indent=2))

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SIEM AI Detector 통합 실행")
    parser.add_argument("--hours", type=float, default=1.0, help="탐지 시간 범위 (기본 1시간)")
    parser.add_argument("--json", action="store_true", help="JSON 형식으로 결과 출력")
    args = parser.parse_args()
    run_all(hours=args.hours, output_json=args.json)
