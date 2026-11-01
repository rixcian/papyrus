import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Player } from '@/player/player'
import { PlayerProvider } from '@/player/provider'
import { offlineStore } from '@/sync'
import { writeLocalProgress } from '@/sync/local-progress'
import { callsTo, reply, route } from '@/test/api'
import { ada } from '@/test/fixtures'
import { setViewport } from '@/test/media'
import { CapturePlayer } from '@/test/player'
import { renderPage } from '@/test/render'
import { ListenPage } from './listen'

const info = {
  id: 'a1',
  bookId: 'b1',
  title: 'Quiet Shore',
  format: 'audio',
  readable: false,
  url: '/api/files/a1',
  duration: null,
  tracks: [
    { position: 1, title: 'One', duration: 100, mime: 'audio/mpeg', size: 1, url: '/t/1.mp3' },
    { position: 2, title: 'Two', duration: 200, mime: 'audio/mpeg', size: 1, url: '/t/2.mp3' },
  ],
  chapters: [
    { title: 'Arrival', start: 0 },
    { title: 'Lighthouse', start: 100 },
  ],
  coverUrl: null,
  authors: ['Ann Author'],
}

const hlc = (wall: number, node = 'dev') => `${String(wall).padStart(13, '0')}-0000-${node}`

function setup({
  profileId = ada.id,
  fileInfo = info as object,
  progress = null as object | null,
} = {}) {
  route('GET /api/session', { profile: { ...ada, id: profileId } })
  route('GET /api/files/:id/info', fileInfo)
  route('GET /api/files/:id/state', { progress, readStatus: 'reading' })
  const player: { current: Player | null } = { current: null }
  const page = renderPage(
    <PlayerProvider>
      <CapturePlayer into={player} />
      <ListenPage />
    </PlayerProvider>,
    { path: '/listen/:fileId', url: '/listen/a1' },
  )
  return { ...page, player: () => player.current as Player }
}

describe('ListenPage', () => {
  beforeEach(() => {
    setViewport(1200)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('opens the Audio File where it was left, and controls playback', async () => {
    const { user, player } = setup({
      progress: { cfi: 't:150.0', fraction: 0.5, deviceId: 'd', hlc: hlc(Date.now()) },
    })
    expect(await screen.findByRole('heading', { name: 'Quiet Shore' })).toBeTruthy()
    expect(player().getState().time).toBe(150)
    expect(screen.getByText('Lighthouse')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(player().getState().playing).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Back 15 seconds' }))
    expect(player().getState().time).toBe(135)
    await user.click(screen.getByRole('button', { name: 'Forward 30 seconds' }))
    expect(player().getState().time).toBe(165)
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }))
    expect(player().getState().time).toBe(100)
    expect(screen.getByRole('button', { name: 'Next chapter' })).toHaveProperty('disabled', true)
  })

  it('prefers this device’s newer progress, and responds to the keyboard', async () => {
    writeLocalProgress(ada.id, 'a1', {
      cfi: 't:40.0',
      fraction: 0.1,
      hlc: hlc(Date.now(), 'zzz'),
      deviceId: 'me',
    })
    const { player } = setup({
      progress: { cfi: 't:150.0', fraction: 0.5, deviceId: 'd', hlc: hlc(1) },
    })
    await screen.findByRole('heading', { name: 'Quiet Shore' })
    expect(player().getState().time).toBe(40)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(player().getState().time).toBe(70)
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(player().getState().time).toBe(55)
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(player().getState().playing).toBe(true)
    fireEvent.keyDown(document.body, { key: 'x' })
  })

  it('scrubs the chapter timeline', async () => {
    const { player } = setup()
    await screen.findByRole('heading', { name: 'Quiet Shore' })
    // The thumb is invisible (the waveform shows the position), so find its input directly.
    const slider = document.querySelector<HTMLInputElement>('input[type=range]') as HTMLInputElement
    expect(slider.getAttribute('aria-label')).toBe('Position in chapter')
    slider.focus()
    fireEvent.keyDown(slider, { key: 'End' })
    await waitFor(() => expect(player().getState().time).toBeGreaterThan(90))
  })

  it('changes speed and sets a sleep timer', async () => {
    const { user, player } = setup()
    await user.click(await screen.findByRole('button', { name: 'Speed' }))
    await user.click(await screen.findByRole('menuitemradio', { name: '1.5×' }))
    expect(player().getState().speed).toBe(1.5)
    await user.click(screen.getByRole('button', { name: 'Speed' }))
    await user.click(await screen.findByRole('menuitem', { name: /Faster/ }))
    expect(player().getState().speed).toBe(1.55)
    await user.click(screen.getByRole('button', { name: 'Speed' }))
    await user.click(await screen.findByRole('menuitem', { name: /Slower/ }))
    expect(player().getState().speed).toBe(1.5)

    await user.click(screen.getByRole('button', { name: 'Sleep timer' }))
    await user.click(await screen.findByRole('menuitem', { name: '2 hours' }))
    expect(player().getState().sleep).toMatchObject({ minutes: 120 })
    expect(screen.getByText(/^1:59:5\d$|^2:00:00$/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Sleep timer' }))
    await user.click(await screen.findByRole('menuitem', { name: 'End of chapter' }))
    expect(await screen.findByText('Chapter')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Sleep timer' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Turn off' }))
    expect(player().getState().sleep).toBeNull()
  })

  it('jumps to a Chapter from the list', async () => {
    const { user, player } = setup()
    await user.click(await screen.findByRole('button', { name: 'Chapters' }))
    await user.click(await screen.findByRole('button', { name: /Lighthouse/ }))
    expect(player().getState().time).toBe(100)
  })

  it('adds, opens and deletes Bookmarks', async () => {
    const { user, player } = setup({ profileId: 'p-listen-bm' })
    await screen.findByRole('heading', { name: 'Quiet Shore' })
    await user.click(screen.getByRole('button', { name: 'Bookmarks' }))
    expect(await screen.findByText(/No bookmarks yet/)).toBeTruthy()
    await user.keyboard('{Escape}')

    act(() => player().seek(120))
    await user.click(screen.getByRole('button', { name: 'Add bookmark' }))
    expect(screen.getByText('Bookmarked 2:00')).toBeTruthy()
    act(() => player().seek(0))
    await user.click(screen.getByRole('button', { name: 'Bookmarks' }))
    await user.click(await screen.findByRole('button', { name: /Lighthouse/ }))
    expect(player().getState().time).toBe(120)

    await user.click(screen.getByRole('button', { name: 'Bookmarks' }))
    await user.click(await screen.findByRole('button', { name: 'Delete bookmark at 2:00' }))
    expect(await screen.findByText(/No bookmarks yet/)).toBeTruthy()
  })

  it('goes back to the Book', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/books/b1'))
  })

  it('says when the File is not an audiobook', async () => {
    setup({ fileInfo: { ...info, tracks: [] } })
    expect(await screen.findByText("This File isn't an audiobook.")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/books/b1')
  })

  it('says when the File cannot be opened', async () => {
    setup()
    route('GET /api/files/:id/info', reply(404, { error: 'x', message: 'Nope' }))
    expect(await screen.findByText(/doesn't exist or isn't Shared with you/)).toBeTruthy()
  })

  it('offline, plays what this device saved', async () => {
    route('GET /t/*', () => new Response('x'))
    await offlineStore.save('p-listen-off', {
      id: 'b1',
      title: 'Saved Shore',
      authors: [],
      coverUrl: null,
      sharedBy: null,
      files: [
        {
          id: 'a1',
          format: 'audio',
          originalName: 'a',
          size: 1,
          audio: {
            duration: 100,
            tracks: [{ url: '/t/1.mp3', duration: 100, title: null, size: 1 }],
            chapters: [],
          },
        },
      ],
    })
    setup({ profileId: 'p-listen-off' })
    route('GET /api/files/:id/info', reply(503))
    route('GET /api/files/:id/state', reply(503))
    expect(await screen.findByRole('heading', { name: 'Saved Shore' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chapters' })).toHaveProperty('disabled', true)
    expect(callsTo('GET /api/files/:id/info').length).toBeGreaterThan(0)
  })

  it('shows nothing without an Active Profile', async () => {
    route('GET /api/session', { profile: null })
    renderPage(
      <PlayerProvider>
        <ListenPage />
      </PlayerProvider>,
      { path: '/listen/:fileId', url: '/listen/a1' },
    )
    await waitFor(() => expect(callsTo('GET /api/session')).toHaveLength(1))
    expect(screen.queryByText('Opening…')).toBeNull()
  })
})
