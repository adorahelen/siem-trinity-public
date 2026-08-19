/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STREAMLIT_URL?: string;
  readonly VITE_DETECTOR_URL?: string;
  readonly VITE_GRAFANA_URL?: string;
  readonly VITE_THEHIVE_URL?: string;
  readonly VITE_MISP_URL?: string;
  readonly VITE_SHUFFLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
