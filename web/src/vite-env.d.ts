/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IP_GEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
