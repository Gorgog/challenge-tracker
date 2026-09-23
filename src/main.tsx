import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from '@/app/App'
import { Toaster } from '@/components/ui/sonner'
import { watchMode } from '@/data/mode'
import { createQueryClient } from '@/data/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { reloadPage } from '@/lib/reload'
import { startThemeSync } from '@/lib/theme'
import './index.css'

startThemeSync()
/* режим сменили в другой вкладке — эта перезагружается, чтобы хранилище и плашка не разошлись */
watchMode(reloadPage)

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* путь сайта: на GitHub Pages — /challenge-tracker/ (vite build --base) */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
        <Toaster position="bottom-center" />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
