/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Production API base URL, including the /api suffix. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
