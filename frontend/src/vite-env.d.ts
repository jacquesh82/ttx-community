/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EDITION: string
  readonly VITE_APP_VERSION: string
  readonly VITE_BUILD_DATE: string
  readonly VITE_COMMIT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
