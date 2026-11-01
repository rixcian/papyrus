import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ApiError } from './api/client'
import { PwaProvider } from './lib/pwa'
import { router } from './router'
import './index.css'

// Night: the app is dark throughout; the reader keeps its own page themes.
document.documentElement.classList.add('dark')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Offline, fail fast so the offline fallbacks show at once.
      retry: (count, error) =>
        navigator.onLine && !(error instanceof ApiError && error.status < 500) && count < 2,
      staleTime: 30_000,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PwaProvider>
        <RouterProvider router={router} />
      </PwaProvider>
    </QueryClientProvider>
  </StrictMode>,
)
