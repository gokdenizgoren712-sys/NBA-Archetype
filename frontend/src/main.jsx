import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
// Fontlar kendi sunucumuzdan (Google Fonts'a erişemeyen tarayıcılarda yedek fonta düşmesin)
import '@fontsource/outfit/300.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/rajdhani/latin-500.css'
import '@fontsource/rajdhani/latin-ext-500.css'
import '@fontsource/rajdhani/latin-600.css'
import '@fontsource/rajdhani/latin-ext-600.css'
import '@fontsource/rajdhani/latin-700.css'
import '@fontsource/rajdhani/latin-ext-700.css'
import './index.css'

const RootApp = import.meta.env.VITE_RANKIT_MOBILE === 'true'
  ? lazy(() => import('./rankit/RankItMobileApp.jsx'))
  : lazy(() => import('./App.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <Suspense fallback={null}><RootApp /></Suspense>
    </HelmetProvider>
  </StrictMode>,
)
