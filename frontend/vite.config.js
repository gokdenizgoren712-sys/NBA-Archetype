import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Backend portu env ile geçersiz kılınabilir (varsayılan 8000, eski davranış aynen).
// Gerekçe: 8000 bazı Windows kurulumlarında başka bir servis tarafından tutulabiliyor
// ve o durumda hiç bind edilemiyor — API_PORT=8010 verip devam edebilmek için.
const API_PORT = process.env.API_PORT || '8000'

// Mobil paketler: siteden indirilen APK (rankit-mobile) ve magaza derlemesi
// (rankit-store). Ikisi ayni uygulama; fark yalniz dagitim kanali (src/rankit/channel.js).
const MOBILE_MODES = new Set(['rankit-mobile', 'rankit-store'])

// iOS: env(safe-area-inset-*) ancak viewport-fit=cover ile deger alir; yoksa
// icerik centigin / Dynamic Island'in altina kayar. Yalniz mobil paketlerde —
// sitenin kendisi mobil Safari'de centige tasmasin (RANKIT_STORE_BLOCKERS_PLAN A3).
function mobileViewport(mode) {
  return {
    name: 'rankit-mobile-viewport',
    transformIndexHtml(html) {
      if (!MOBILE_MODES.has(mode)) return html
      return html.replace(/(<meta name="viewport" content=")([^"]*)(")/, (all, open, content, close) =>
        content.includes('viewport-fit') ? all : `${open}${content}, viewport-fit=cover${close}`)
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), mobileViewport(mode)],
  // RankIt mobil paketi kendi API'sinden veri alir; web sitesinin yuzlerce MB'lik
  // oyuncu/futbol fotograf arsivini APK icine kopyalamaz.
  publicDir: MOBILE_MODES.has(mode) ? false : 'public',
  server: {
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
      '/ws': { target: `ws://localhost:${API_PORT}`, ws: true },
    },
  },
}))
