import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react(), tailwindcss(), {
    name: 'mock-data', enforce: 'pre',
    resolveId(id: string) {
      return id.endsWith('contexts/DataContext') ? path.resolve(import.meta.dirname, 'mockData.tsx') : null
    },
  }],
  server: { port: 5199, fs: { allow: [path.resolve(import.meta.dirname, '..')] } },
})
