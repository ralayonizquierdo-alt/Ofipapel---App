import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH ?? '/Ofipapel---App/erp-propio/',
  build: {
    rollupOptions: {
      // nexa.html: prototipo visual aislado de NEXA, fuera de la aplicación principal.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        nexa: fileURLToPath(new URL('./nexa.html', import.meta.url)),
      },
    },
  },
})
