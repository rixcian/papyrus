import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pwaState, updateServiceWorker } from '@/test/pwa-register'
import { APP_VERSION, PwaProvider, platform, useInstallPrompt, usePwa } from './pwa'

function Probe() {
  const pwa = usePwa()
  return (
    <button type="button" onClick={pwa.update}>
      {pwa.needRefresh ? 'refresh' : 'current'}
    </button>
  )
}

describe('PwaProvider', () => {
  afterEach(() => {
    pwaState.needRefresh = false
    pwaState.registration = undefined
    vi.useRealTimers()
  })

  it('offers a waiting update and installs it on request', async () => {
    pwaState.needRefresh = true
    render(
      <PwaProvider>
        <Probe />
      </PwaProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }))
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('checks for updates every hour', () => {
    vi.useFakeTimers()
    const update = vi.fn(async () => {})
    pwaState.registration = { update }
    render(
      <PwaProvider>
        <Probe />
      </PwaProvider>,
    )
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(update).toHaveBeenCalled()
  })

  it('has a harmless default outside the provider', async () => {
    render(<Probe />)
    await userEvent.click(screen.getByRole('button', { name: 'current' }))
  })
})

describe('useInstallPrompt', () => {
  it('offers the browser’s install prompt until installed', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current).toBeNull()

    const prompt = vi.fn(async () => {})
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    act(() => void window.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    expect(result.current).toBeTypeOf('function')

    await act(() => result.current?.())
    expect(prompt).toHaveBeenCalled()
    expect(result.current).toBeNull()

    act(() => void window.dispatchEvent(event))
    expect(result.current).not.toBeNull()
    act(() => void window.dispatchEvent(new Event('appinstalled')))
    expect(result.current).toBeNull()
  })
})

describe('platform', () => {
  afterEach(() => vi.restoreAllMocks())

  function as(ua: string, { standalone = false, touch = 0 } = {}) {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(touch)
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: standalone } as MediaQueryList)
    return platform()
  }

  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
  it.each([
    ['installed', () => as(mac, { standalone: true })],
    ['ios', () => as('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')],
    ['ios', () => as(`${mac} Safari/605.1`, { touch: 5 })],
    ['firefox', () => as('Mozilla/5.0 (X11; Linux) Firefox/130.0')],
    ['macos-safari', () => as(`${mac} Version/17.0 Safari/605.1`)],
    ['other', () => as(`${mac} Chrome/130.0 Safari/537.36`)],
  ])('detects %s', (expected, detect) => expect(detect()).toBe(expected))
})

it('knows the app version', () => expect(APP_VERSION).toBe('0.0.0-test'))
