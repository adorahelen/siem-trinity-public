import ExternalLinkPage from "@/components/ExternalLinkPage";

export default function Workflows() {
  return (
    <ExternalLinkPage
      title="워크플로"
      description="SOAR (Security Orchestration, Automation and Response) — 탐지 → 액션 자동화 라인"
      service="Shuffle"
      url={import.meta.env.VITE_SHUFFLE_URL ?? "http://192.168.10.232:3001"}
      credentials={[{ label: "최초 진입 시", value: "신규 가입 필요" }]}
      upcoming={[
        "워크플로 목록·실행 이력을 TrinitySOC 에 직접 표시",
        "탐지 알람의 webhook 트리거 결과 추적",
        "워크플로 노드 그래프 시각화 (ECharts graph)",
      ]}
      apiHint="GET /api/workflows · GET /api/workflows/:id/runs"
    />
  );
}
