import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Backend portu env ile geçersiz kılınabilir (varsayılan 8000, eski davranış aynen).
// Gerekçe: 8000 bazı Windows kurulumlarında başka bir servis tarafından tutulabiliyor
// ve o durumda hiç bind edilemiyor — API_PORT=8010 verip devam edebilmek için.
const API_PORT = process.env.API_PORT || '8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
      '/ws': { target: `ws://localhost:${API_PORT}`, ws: true },
    },
  },
})
