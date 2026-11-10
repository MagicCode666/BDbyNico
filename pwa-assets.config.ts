import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: minimal2023Preset,
  // Attention : les icônes de public/ sont dessinées à la main (kit « Fracture »), pas générées ;
  // lancer ce générateur les écraserait.
  images: ['src/assets/brand/icone-app.svg'],
})
