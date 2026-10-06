import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The Express API runs on :4000 in development
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
})
