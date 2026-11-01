import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaProvider } from '@/lib/pwa'
import type { Player } from '@/player/player'
import { PlayerProvider } from '@/player/provider'
import { route } from '@/test/api'
import { playerItem } from '@/test/audio'
import { ada } from '@/test/fixtures'
import { CapturePlayer } from '@/test/player'
import { pwaState } from '@/test/pwa-register'
import { LocationProbe, testQueryClient } from '@/test/render'
import { installFakeXhr } from '@/test/xhr'
import { AppShell, LIBRARY_SEARCH_ID } from './app-shell'

function Library() {
  const { state } = useLocation()
  return (
    <>
      <input id={LIBRARY_SEARCH_ID} aria-label="Search the library" />
      {state?.focusSearch && <p>Focus search</p>}
    </>
  )
}

function setup(url = '/') {
  route('GET /api/session', { profile: ada })
  const player: { current: Player | null } = { current: null }
  const router = createMemoryRouter(
    [
      {
        element: (
          <PlayerProvider>
            <CapturePlayer into={player} />
            <AppShell />
            <LocationProbe />
          </PlayerProvider>
        ),
        children: [
          { index: true, element: <Library /> },
          { path: 'settings', element: <p>Settings page</p> },
          { path: 'books/:id', element: <p>Book page</p> },
        ],
      },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [url] },
  )
  render(
    <QueryClientProvider client={testQueryClient()}>
      <PwaProvider>
        <RouterProvider router={router} />
      </PwaProvider>
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), player: player.current as Player, router }
}

const location = () => screen.getAllByTestId('location')[0]?.textContent

describe('AppShell', () => {
  afterEach(() => {
    pwaState.needRefresh = false
  })

  it('navigates between the main places', async () => {
    const { user } = setup()
    const [top] = screen.getAllByRole('navigation', { name: 'Main' })
    expect(top).toBeTruthy()
    await user.click(screen.getAllByRole('link', { name: 'Settings' })[0] as HTMLElement)
    expect(await screen.findByText('Settings page')).toBeTruthy()
    await user.click(screen.getAllByRole('link', { name: 'Library' })[0] as HTMLElement)
    expect(location()).toBe('/')
  })

  it('search focuses the library’s field, or goes to the library to focus it', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(document.activeElement?.id).toBe(LIBRARY_SEARCH_ID)

    const other = setup('/settings')
    await other.user.click(screen.getAllByRole('button', { name: 'Search' })[1] as HTMLElement)
    expect(await screen.findByText('Focus search')).toBeTruthy()
  })

  it('uploads picked files', async () => {
    const xhrs = installFakeXhr()
    const { user } = setup()
    const picker = document.querySelector<HTMLInputElement>('input[type=file]') as HTMLInputElement
    const click = vi.spyOn(picker, 'click')
    await user.click(screen.getByRole('button', { name: 'Upload books' }))
    expect(click).toHaveBeenCalled()
    await user.upload(picker, new File(['x'], 'dune.epub'))
    await waitFor(() => expect(xhrs).toHaveLength(1))
    expect(picker.value).toBe('')
  })

  it('opens Settings and Switch Profile from the Profile menu', async () => {
    const { user } = setup()
    const [menu] = await screen.findAllByRole('button', { name: 'Ada: Profile menu' })
    await user.click(menu as HTMLElement)
    await user.click(await screen.findByRole('menuitem', { name: 'Settings' }))
    expect(location()).toBe('/settings')
    await user.click(screen.getAllByRole('button', { name: 'Ada: Profile menu' })[0] as HTMLElement)
    await user.click(await screen.findByRole('menuitem', { name: 'Switch Profile' }))
    await waitFor(() => expect(location()).toBe('/profiles'))
  })

  it('offers a waiting update', () => {
    pwaState.needRefresh = true
    setup()
    expect(screen.getByText('A new version of Papyrus is ready.')).toBeTruthy()
  })

  it('links to the full player while something plays', async () => {
    const { player } = setup('/books/b1')
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    act(() => player.load(playerItem(), 0))
    expect(screen.getAllByRole('link', { name: 'Listening' })[0]?.getAttribute('href')).toBe(
      '/listen/a1',
    )
    expect(screen.getByRole('region', { name: 'Now playing' })).toBeTruthy()
  })

  it('frosts the top bar once the page scrolls', () => {
    setup()
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true })
    act(() => void window.dispatchEvent(new Event('scroll')))
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })
})
