import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaProvider } from '@/lib/pwa'
import { offlineStore } from '@/sync'
import { pwaState } from '@/test/pwa-register'
import { renderPage } from '@/test/render'
import { ThisDevice } from './this-device'

const stubStorage = (storage: unknown) =>
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true })

async function keep(profileId: string, bookId: string, title: string, audio = false) {
  await offlineStore.save(profileId, {
    id: bookId,
    title,
    authors: [],
    coverUrl: null,
    sharedBy: null,
    files: audio
      ? [
          {
            id: 'a1',
            format: 'audio',
            originalName: 'a',
            size: 0,
            audio: { duration: 1, tracks: [], chapters: [] },
          },
        ]
      : [],
  })
}

describe('ThisDevice', () => {
  afterEach(() => {
    stubStorage(undefined)
    pwaState.needRefresh = false
    vi.restoreAllMocks()
  })

  it('lists Offline Books and removes them one at a time or all at once', async () => {
    await keep('p-td', 'b1', 'Dune', true)
    await keep('p-td', 'b2', 'Emma')
    const { user } = renderPage(<ThisDevice profileId="p-td" />)
    expect(await screen.findByRole('link', { name: /Dune/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Audiobook' })).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1] as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('link', { name: /Dune/ })).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Remove all offline' }))
    await user.click(await screen.findByRole('button', { name: 'Remove all' }))
    expect(await screen.findByText(/None yet/)).toBeTruthy()
  })

  it('shows storage use and whether the browser keeps it', async () => {
    stubStorage({
      estimate: async () => ({ usage: 2048, quota: 4096 }),
      persisted: async () => true,
    })
    renderPage(<ThisDevice profileId="p-td2" />)
    expect(await screen.findByText('2 KB of 4 KB available')).toBeTruthy()
    expect(screen.getByText(/it won’t be cleared/)).toBeTruthy()
    expect(screen.getByText('0.0.0-test')).toBeTruthy()
  })

  it('shows storage use without a quota, or unknown', async () => {
    stubStorage({ estimate: async () => ({ usage: 100 }), persisted: async () => false })
    renderPage(<ThisDevice profileId="p-td3" />)
    expect(await screen.findByText('100 B')).toBeTruthy()
    expect(screen.getByText(/Not guaranteed/)).toBeTruthy()
  })

  it('offers a waiting update', async () => {
    pwaState.needRefresh = true
    renderPage(
      <PwaProvider>
        <ThisDevice profileId="p-td4" />
      </PwaProvider>,
    )
    expect(screen.getByText('Update available')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  it('says when Papyrus is installed', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    renderPage(<ThisDevice profileId="p-td5" />)
    expect(screen.getByText('Papyrus is installed on this device.')).toBeTruthy()
  })

  it('offers the browser’s install prompt, or explains how to install', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (X11; Linux) Firefox/130.0',
    )
    renderPage(<ThisDevice profileId="p-td6" />)
    expect(screen.getByText(/Firefox on the desktop/)).toBeTruthy()

    const prompt = vi.fn(async () => {})
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    act(() => void window.dispatchEvent(event))
    await act(async () => screen.getByRole('button', { name: 'Install Papyrus' }).click())
    expect(prompt).toHaveBeenCalled()
  })
})
