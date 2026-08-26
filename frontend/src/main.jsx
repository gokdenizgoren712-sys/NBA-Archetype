import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
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
