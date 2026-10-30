import { useRegisterSW } from 'virtual:pwa-register/react'
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react'

const UPDATE_CHECK_MS = 60 * 60 * 1000

interface Pwa {
  /** A new version is installed and waiting; it takes over only when the user says so. */
  needRefresh: boolean
  update(): void
}

const PwaContext = createContext<Pwa>({ needRefresh: false, update: () => {} })

/**
 * Registers the service worker with prompt-for-update, checking hourly (ticket 05). The app
 * never reloads by itself, so nobody loses their place mid-chapter.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS)
    },
  })
  return (
    <PwaContext.Provider value={{ needRefresh, update: () => void updateServiceWorker(true) }}>
      {children}
    </PwaContext.Provider>
  )
}

export const usePwa = () => useContext(PwaContext)

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chromium fires this once, early, so it is caught at load rather than in a component.
let installPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as InstallPromptEvent
  emit()
})
window.addEventListener('appinstalled', () => {
  installPrompt = null
  emit()
})

/** Chromium's install prompt, when the browser offers one. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const event = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => installPrompt,
  )
  if (!event) return null
  return async () => {
    await event.prompt()
    await event.userChoice
    installPrompt = null
    emit()
  }
}

export type Platform = 'installed' | 'ios' | 'macos-safari' | 'firefox' | 'other'

export function platform(): Platform {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (window.matchMedia('(display-mode: standalone)').matches || nav.standalone) return 'installed'
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac, but with touch.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return 'ios'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua))
    return 'macos-safari'
  return 'other'
}

export const APP_VERSION: string = __APP_VERSION__
