import { vi } from 'vitest'

/** Stands in for vite-plugin-pwa's virtual module; tests set `needRefresh` and read the spies. */
export const pwaState = { needRefresh: false, registration: undefined as unknown }
export const updateServiceWorker = vi.fn(async (_reload?: boolean) => {})

export function useRegisterSW(options: {
  onRegisteredSW?: (url: string, registration: unknown) => void
}) {
  options.onRegisteredSW?.('/sw.js', pwaState.registration)
  return {
    needRefresh: [pwaState.needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker,
  }
}
