import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { offlineStore, syncEngine } from '@/sync'
import { readLocalProgress, writeLocalProgress } from '@/sync/local-progress'
import { callsTo, reply, route } from '@/test/api'
import { ada } from '@/test/fixtures'
import { FakeView, resetFakeView } from '@/test/foliate'
import { setViewport } from '@/test/media'
import { renderPage } from '@/test/render'
import { ReaderPage } from './reader'

vi.mock('@/vendor/foliate-js/view.js', () => import('@/test/foliate'))
vi.mock('@/vendor/foliate-js/overlayer.js', () => import('@/test/foliate'))

const info = {
  id: 'f1',
  bookId: 'b1',
  title: 'Dune',
  format: 'epub',
  readable: true,
  url: '/api/files/f1',
  duration: null,
  tracks: [],
  chapters: [],
  coverUrl: null,
  authors: [],
}
const hlc = (wall: number, node: string) => `${String(wall).padStart(13, '0')}-0000-${node}`
const RANGE = 'epubcfi(/6/4!/4/2,/1:0,/1:10)'
const POINT = 'epubcfi(/6/4!/4/2/1:5)'

function setup({ profileId = ada.id, progress = null as object | null, translate = false } = {}) {
  route('GET /api/session', { profile: { ...ada, id: profileId } })
  route('GET /api/files/:id', () => new Response('epub bytes'))
  route('GET /api/files/:id/info', info)
  route('GET /api/files/:id/state', { progress, readStatus: 'reading' })
  route('GET /api/translate/status', { enabled: translate })
  return renderPage(<ReaderPage />, { path: '/read/:fileId', url: '/read/f1' })
}

const view = () => FakeView.last as FakeView
const opened = async () => {
  await screen.findByText('Dune')
  await waitFor(() => expect(view()?.calls[0]).toMatch(/^init:/))
  // Contents enable once the book reports it is ready.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Contents' })).toHaveProperty('disabled', false),
  )
}

/**
 * Taps the Highlight until the bar shows `button`. A saved change reaches the page a moment
 * later (through IndexedDB), and a tap acts on the Highlights as they were when it landed.
 */
async function tapUntil(doc: Document, button: { name: string; pressed?: boolean }) {
  for (let attempt = 0; attempt < 40; attempt++) {
    act(() => view().tapHighlight(RANGE, doc))
    if (screen.queryByRole('button', button)) return
    await act(() => new Promise((r) => setTimeout(r, 25)))
  }
  expect(screen.getByRole('button', button)).toBeTruthy()
}

describe('ReaderPage', () => {
  beforeEach(() => {
    resetFakeView()
    setViewport(1200)
  })
  afterEach(() => vi.restoreAllMocks())

  it('opens the book and saves progress as pages turn', async () => {
    setup({ profileId: 'p-read' })
    await opened()
    expect(screen.getByText('· Chapter 1')).toBeTruthy()
    act(() => view().relocate(POINT, 0.42))
    expect(readLocalProgress('p-read', 'f1')).toMatchObject({ cfi: POINT, fraction: 0.42 })
    expect(screen.getByText('42%')).toBeTruthy()
  })

  it('resumes from this device, offering to jump to a newer place from another device', async () => {
    writeLocalProgress('p-jump', 'f1', {
      cfi: 'epubcfi(/6/2!/4/2/1:0)',
      fraction: 0.1,
      hlc: hlc(1, 'me'),
      deviceId: syncEngine.deviceId,
    })
    const { user } = setup({
      profileId: 'p-jump',
      progress: { cfi: POINT, fraction: 0.6, deviceId: 'other', hlc: hlc(Date.now(), 'zz') },
    })
    await opened()
    expect(view().calls[0]).toBe('init:epubcfi(/6/2!/4/2/1:0)')
    expect(screen.getByText('You were at 60% on another device.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Jump there' }))
    expect(view().calls).toContain(`goTo:${POINT}`)
    expect(screen.queryByText(/on another device/)).toBeNull()
  })

  it('can dismiss the jump offer, and resumes from the server alone', async () => {
    writeLocalProgress('p-dismiss', 'f1', {
      cfi: 'epubcfi(/6/2!/4/2/1:0)',
      fraction: 0.1,
      hlc: hlc(1, 'me'),
      deviceId: 'me',
    })
    const { user } = setup({
      profileId: 'p-dismiss',
      progress: { cfi: POINT, fraction: 0.6, deviceId: 'other', hlc: hlc(Date.now(), 'zz') },
    })
    await opened()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/on another device/)).toBeNull()

    resetFakeView()
    setup({
      profileId: 'p-remote',
      progress: { cfi: POINT, fraction: 0.6, deviceId: 'other', hlc: hlc(1, 'zz') },
    })
    await waitFor(() => expect(FakeView.last?.calls[0]).toBe(`init:${POINT}`))
  })

  it('taps toggle the bars and turn pages', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true })
    setup({ profileId: 'p-tap' })
    await opened()
    const doc = view().loadSection()
    const tap = (x: number) => {
      doc.body.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, clientX: x }))
      act(() => vi.runOnlyPendingTimers())
    }
    tap(window.innerWidth / 2)
    expect(screen.getByRole('banner').className).toContain('opacity-0')
    tap(window.innerWidth / 2)
    expect(screen.getByRole('banner').className).not.toContain('opacity-0')
    tap(5)
    tap(window.innerWidth - 5)
    expect(view().calls.slice(-2)).toEqual(['goLeft', 'goRight'])
    vi.useRealTimers()
  })

  it('highlights a selection, recolours, notes and deletes it', async () => {
    const { user } = setup({ profileId: 'p-hl' })
    await opened()
    const doc = view().loadSection()
    view().select(doc, 'The spice must flow.')
    await user.click(await screen.findByRole('button', { name: 'Highlight green' }))
    await waitFor(() => expect(view().annotations.has(RANGE)).toBe(true))

    // Selecting the same words again acts on that Highlight.
    view().select(doc, 'The spice must flow.')
    await user.click(await screen.findByRole('button', { name: 'Highlight pink' }))
    view().select(doc, 'The spice must flow.')
    await user.click(await screen.findByRole('button', { name: 'Highlight pink' }))

    await tapUntil(doc, { name: 'Highlight pink', pressed: true })
    await user.click(screen.getByRole('button', { name: 'Highlight blue' }))

    await tapUntil(doc, { name: 'Highlight blue', pressed: true })
    await user.click(screen.getByRole('button', { name: 'Note' }))
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), 'Remember')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await tapUntil(doc, { name: 'Edit note' })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(view().annotations.has(RANGE)).toBe(false))
  })

  it('notes a new selection, copies one, and picks among overlapping Highlights', async () => {
    const { user } = setup({ profileId: 'p-note' })
    await opened()
    const doc = view().loadSection()
    view().select(doc, 'The spice must flow.')
    await user.click(await screen.findByRole('button', { name: 'Note' }))
    await user.type(await screen.findByRole('textbox', { name: 'Note' }), '  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    FakeView.selectionCfi = 'epubcfi(/6/4!/4/2,/1:5,/1:20)'
    view().select(doc, 'must flow')
    await user.click(await screen.findByRole('button', { name: 'Highlight blue' }))
    await waitFor(() => expect(view().annotations.size).toBe(2))

    act(() => view().tapHighlight(RANGE, doc))
    await user.click(await screen.findByRole('button', { name: 'must flow' }))
    expect(
      await screen.findByRole('button', { name: 'Highlight blue', pressed: true }),
    ).toBeTruthy()

    view().select(doc, 'Copy me')
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(await screen.findByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('Copy me')
  })

  it('translates a selection when the server can', async () => {
    route('POST /api/translate', { text: 'Das Gewürz', detectedSource: 'EN' })
    const { user } = setup({ profileId: 'p-tr', translate: true })
    await opened()
    const doc = view().loadSection()
    view().select(doc, 'The spice')
    await user.click(await screen.findByRole('button', { name: 'Translate' }))
    expect(await screen.findByText('Das Gewürz')).toBeTruthy()
    // Turning the page moves the words, so the card goes.
    act(() => view().relocate(POINT, 0.5))
    expect(screen.queryByText('Das Gewürz')).toBeNull()
    view().select(doc, 'The spice')
    await user.click(await screen.findByRole('button', { name: 'Translate' }))
    await user.click(await screen.findByRole('button', { name: 'Close translation' }))
    expect(screen.queryByRole('dialog', { name: 'Translation' })).toBeNull()
  })

  it('bookmarks the page and removes the bookmark', async () => {
    const { user } = setup({ profileId: 'p-bm' })
    await opened()
    act(() => view().relocate(RANGE, 0.3, { range: { toString: () => '  The   spice ' } }))
    await user.click(screen.getByRole('button', { name: 'Bookmark this page' }))
    expect(await screen.findByRole('button', { name: 'Remove bookmark' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove bookmark' }))
    expect(await screen.findByRole('button', { name: 'Bookmark this page' })).toBeTruthy()
  })

  it('lists Highlights and Bookmarks to go to, delete and export', async () => {
    const assign = vi.fn()
    const { user } = setup({ profileId: 'p-notes' })
    await opened()
    const doc = view().loadSection()
    view().select(doc, 'The spice must flow.')
    await user.click(await screen.findByRole('button', { name: 'Highlight yellow' }))
    act(() => view().relocate(POINT, 0.3))
    await user.click(screen.getByRole('button', { name: 'Bookmark this page' }))

    await user.click(screen.getByRole('button', { name: 'Notes' }))
    await user.click(await screen.findByRole('button', { name: /The spice must flow/ }))
    expect(view().calls).toContain(`goTo:${RANGE}`)

    await user.click(screen.getByRole('button', { name: 'Notes' }))
    await user.click(await screen.findByRole('button', { name: 'Delete highlight' }))
    await user.click(await screen.findByRole('button', { name: 'Delete bookmark' }))
    expect(await screen.findByText(/Select text to highlight it/)).toBeTruthy()

    Object.defineProperty(window, 'location', {
      value: {
        set href(v: string) {
          assign(v)
        },
      },
      configurable: true,
    })
    await user.click(screen.getByRole('button', { name: /Export highlights/ }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/api/books/b1/highlights.md'))
  })

  it('navigates by contents, search and the position slider, and restyles the text', async () => {
    FakeView.searchEvents = [
      {
        label: 'Chapter 1',
        subitems: [{ cfi: 'hit', excerpt: { pre: 'the ', match: 'spice', post: ' flows' } }],
      },
      'done',
    ]
    const { user } = setup({ profileId: 'p-nav' })
    await opened()
    await user.click(screen.getByRole('button', { name: 'Contents' }))
    await user.click(await screen.findByRole('button', { name: 'Chapter 1' }))
    expect(view().calls).toContain('goTo:ch1.xhtml')

    await user.click(screen.getByRole('button', { name: 'Search in book' }))
    await user.type(await screen.findByLabelText('Search in this book'), 'spice{enter}')
    await user.click(await screen.findByRole('button', { name: 'the spice flows' }))
    expect(view().calls).toContain('goTo:hit')

    const slider = document.querySelector<HTMLInputElement>('input[type=range]') as HTMLInputElement
    slider.focus()
    await user.keyboard('{End}')
    await waitFor(() => expect(view().calls.some((c) => c.startsWith('goToFraction:'))).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Text and layout' }))
    await user.click(await screen.findByRole('button', { name: 'Sepia' }))
    expect(view().renderer.setStyles).toHaveBeenLastCalledWith(expect.stringContaining('#f4ecd8'))
  })

  it('opens search with Ctrl+F', async () => {
    setup({ profileId: 'p-find' })
    await opened()
    act(
      () =>
        void window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true }),
        ),
    )
    expect(await screen.findByLabelText('Search in this book')).toBeTruthy()
  })

  it('explains a book that will not open', async () => {
    FakeView.failOpen = new Error('Bad zip')
    setup({ profileId: 'p-bad' })
    expect(await screen.findByText("Couldn't open this book: Bad zip")).toBeTruthy()
  })

  it('says when the format cannot be read in the browser', async () => {
    setup()
    route('GET /api/files/:id/info', { ...info, readable: false })
    expect(await screen.findByText(/can be downloaded but not read/)).toBeTruthy()
  })

  it('says when the File cannot be found or downloaded', async () => {
    setup()
    route('GET /api/files/:id/info', reply(404, { error: 'x', message: 'Nope' }))
    expect(await screen.findByText(/doesn't exist or isn't Shared with you/)).toBeTruthy()
  })

  it('says when the download fails', async () => {
    setup()
    route('GET /api/files/:id', reply(500))
    expect(await screen.findByText("Couldn't download the File (500)")).toBeTruthy()
  })

  it('offline, reads the copy saved on this device', async () => {
    route('GET /api/files/:id', () => new Response('epub bytes'))
    await offlineStore.save('p-read-off', {
      id: 'b1',
      title: 'Saved Dune',
      authors: [],
      coverUrl: null,
      sharedBy: null,
      files: [{ id: 'f1', format: 'epub', originalName: 'a', size: 1 }],
    })
    setup({ profileId: 'p-read-off' })
    route('GET /api/files/:id/info', reply(503))
    route('GET /api/files/:id/state', reply(503))
    route('GET /api/files/:id', reply(503))
    expect(await screen.findByText('Saved Dune')).toBeTruthy()
  })

  it('shows nothing without an Active Profile', async () => {
    route('GET /api/session', { profile: null })
    route('GET /api/files/:id/state', reply(404))
    renderPage(<ReaderPage />, { path: '/read/:fileId', url: '/read/f1' })
    await waitFor(() => expect(callsTo('GET /api/session')).toHaveLength(1))
    expect(screen.queryByText('Opening…')).toBeNull()
  })
})
