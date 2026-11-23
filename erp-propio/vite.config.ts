import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// «? → Acerca de»: versión de package.json y, en Netlify, el commit publicado (COMMIT_REF).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
// Identificador de esta publicación: lo lleva dentro la app y lo publica version.json, para que
// la app avise cuando hay una versión nueva (components/shell/AvisoVersion.tsx).
const BUILD_ID = `${process.env.COMMIT_REF ?? 'local'}-${Date.now()}`

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // tv-simple.html: pantalla de repartos para TVs con navegador muy viejo (JS de los de antes, sin mapa). Lleva dentro la
      // URL y la clave pública de Supabase, que se toman aquí del entorno de la publicación: no se guardan en el repositorio.
      name: 'tv-simple',
      generateBundle() {
        const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'VITE_')
        const url = env.VITE_SUPABASE_URL ?? ''
        const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
        const plantilla = readFileSync(new URL('./tv-simple.template.html', import.meta.url), 'utf8')
        this.emitFile({ type: 'asset', fileName: 'tv-simple.html', source: plantilla.replace('__SUPABASE_URL__', url).replace('__SUPABASE_KEY__', key) })
      },
    },
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(process.env.COMMIT_REF ?? ''),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  base: process.env.VITE_BASE_PATH ?? '/Ofipapel---App/erp-propio/',
  // Archivo → Carga Cotización: en desarrollo, el mismo atajo que public/_redirects hace en Netlify.
  server: {
    proxy: {
      '/bce': { target: 'https://www.ecb.europa.eu', changeOrigin: true, rewrite: (p) => p.replace(/^\/bce/, '/stats/eurofxref') },
    },
  },
  build: {
    rollupOptions: {
      // nexa.html: prototipo visual aislado de NEXA, fuera de la aplicación principal.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        nexa: fileURLToPath(new URL('./nexa.html', import.meta.url)),
        // Entrada propia de la app de reparto: el iPhone guarda el icono y el nombre que trae la página (no los de JS).
        repartidor: fileURLToPath(new URL('./repartidor.html', import.meta.url)),
      },
    },
  },
})
