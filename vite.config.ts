import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }
// GitHub Actions fournit le commit déployé ; en local on affiche « dev »
const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'

// Le site est publié sur https://magiccode666.github.io/BDbyNico/
export default defineConfig({
  base: '/BDbyNico/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  // Port fixe : les liens des emails d'authentification n'aboutissent qu'à localhost:5173.
  // Si un serveur tourne déjà, Vite s'arrête avec un message au lieu de grimper de port.
  server: { port: 5173, strictPort: true },
  test: { environment: 'jsdom' },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'BDbyNico',
        short_name: 'BDbyNico',
        description: 'Gérez votre collection de bandes dessinées.',
        lang: 'fr',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
