import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Static builds (npm run build:static) inline everything into one self-contained
// index.html (viteSingleFile) with hash-based routing, so double-clicking the file
// works with no server: an inline <script type="module"> runs fine offline, unlike
// an external one loaded from file://, which browsers block via CORS.
export default defineConfig(({ mode }) => {
  const isStatic = mode === 'static'
  return {
    base: isStatic ? './' : '/erp/',
    plugins: [react(), tailwindcss(), ...(isStatic ? [viteSingleFile()] : [])],
    define: {
      __USE_HASH_ROUTER__: isStatic,
    },
  }
})
