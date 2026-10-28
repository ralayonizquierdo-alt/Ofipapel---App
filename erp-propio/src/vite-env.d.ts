/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Inyectados por vite.config.ts (define): versión, commit de Netlify y fecha de construcción. */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __APP_BUILD_DATE__: string
