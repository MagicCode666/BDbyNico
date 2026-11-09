/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Version du paquet (package.json), injectée au build par vite.config.ts. */
declare const __APP_VERSION__: string
/** Code court du commit déployé (« dev » en local), injecté au build. */
declare const __APP_COMMIT__: string
