import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Point the dev proxy at the deployed SWA so `npm run dev` can call the real
// /api and /.auth endpoints without CORS. Override per-machine with
// VITE_API_TARGET once the SWA is provisioned (do not hardcode secrets).
const API_TARGET = process.env.VITE_API_TARGET ?? 'https://<your-swa-hostname>'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, secure: true },
      '/.auth': { target: API_TARGET, changeOrigin: true, secure: true },
    },
  },
})
