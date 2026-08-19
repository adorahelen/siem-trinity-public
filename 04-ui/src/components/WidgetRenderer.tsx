import MetricCard from "./MetricCard";
import GaugeCard from "./GaugeCard";
import TimeSeriesCard from "./TimeSeriesCard";
import TopkTable from "./TopkTable";
import LogStream from "./LogStream";
import ResourceCard from "./ResourceCard";
import NetworkCard from "./NetworkCard";
import StorageCard from "./StorageCard";
import PortsCard from "./PortsCard";
import SensorsCard from "./SensorsCard";
import XdrToggleBadgeCard from "./XdrToggleBadgeCard";
import TheHiveKpiCard from "./TheHiveKpiCard";
import UptimeCard from "./UptimeCard";
import type { WidgetConfig } from "@/lib/widgets";

export default function WidgetRenderer({ config }: { config: WidgetConfig }) {
  switch (config.type) {
    case "metric":
      return <MetricCard {...config.data} />;
    case "gauge":
      return <GaugeCard {...config.data} />;
    case "timeseries":
      return <TimeSeriesCard {...config.data} />;
    case "topk":
      return <TopkTable {...config.data} />;
    case "log":
      return <LogStream {...config.data} />;
    case "resource":
      return <ResourceCard kind={config.data.kind} />;
    case "network":
      return <NetworkCard />;
    case "storage":
      return <StorageCard />;
    case "ports":
      return <PortsCard />;
    case "sensors":
      return <SensorsCard />;
    case "xdr_toggles":
      return <XdrToggleBadgeCard />;
    case "thehive_kpi":
      return <TheHiveKpiCard />;
    case "uptime":
      return <UptimeCard />;
  }
}
