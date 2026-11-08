import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Le site est publié sur https://magiccode666.github.io/BDbyNico/
export default defineConfig({
  base: '/BDbyNico/',
  plugins: [react(), tailwindcss()],
})
