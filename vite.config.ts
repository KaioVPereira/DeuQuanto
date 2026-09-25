import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5190,
    // Só para testar no navegador: o catálogo do Atacadão não libera CORS. No celular
    // a chamada sai pelo HTTP nativo e não passa por aqui (src/lib/web.ts).
    proxy: {
      '/proxy/atacadao': {
        target: 'https://www.atacadao.com.br',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/atacadao/, ''),
      },
    },
  },
})
