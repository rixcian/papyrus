import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UploadProvider } from '@/components/uploads'
import { offlineStore } from '@/sync'
import { callsTo, reply, route } from '@/test/api'
import { ada, bookSummary } from '@/test/fixtures'
import { setViewport } from '@/test/media'
import { renderPage } from '@/test/render'
import { installFakeXhr } from '@/test/xhr'
import { LibraryPage } from './library'

const facets = {
  authors: [{ name: 'Frank Herbert', count: 1 }],
  series: [],
  tags: [],
  shared: 1,
  hidden: 0,
  audio: 1,
}
const reading = (id: string, kind: 'text' | 'audio' = 'text') =>
  bookSummary({
    id,
    title: `Book ${id}`,
    readStatus: 'reading',
    lastRead: {
      fileId: `f-${id}`,
      fraction: 0.4,
      at: 1,
      kind,
      duration: kind === 'audio' ? 3600 : null,
    },
  })

function setup({
  books = [bookSummary(), bookSummary({ id: 'b2', title: 'Emma', owned: false, sharedBy: 'Bob' })],
  continuing = [] as ReturnType<typeof bookSummary>[],
  url = '/',
  width = 1200,
  f = facets as object,
} = {}) {
  setViewport(width)
  route('GET /api/session', { profile: ada })
  route('GET /api/profiles', { profiles: [ada] })
  route('GET /api/shelves', { shelves: [{ id: 's1', name: 'Sci-fi', count: 1 }] })
  route('GET /api/books/facets', f)
  route('GET /api/books', ({ query }) =>
    query.get('status') === 'reading' && query.get('sort') === 'recent'
      ? { books: continuing, total: continuing.length, nextCursor: null }
      : { books, total: books.length, nextCursor: null },
  )
  return renderPage(
    <UploadProvider>
      <LibraryPage />
    </UploadProvider>,
    { url },
  )
}

const location = () => screen.getByTestId('location').textContent ?? ''

describe('LibraryPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists the library with a count', async () => {
    setup()
    expect(await screen.findByText('2 Books')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Emma/ })).toBeTruthy()
  })

  it('leads with the Book read last, and the others in progress', async () => {
    setup({ continuing: [reading('r1'), reading('r2', 'audio'), reading('r3')] })
    expect(await screen.findByText('Continue reading')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Resume reading/ }).getAttribute('href')).toBe(
      '/read/f-r1',
    )
    const also = screen.getByRole('list', { name: 'Also in progress' })
    expect(also.querySelector('a')?.getAttribute('href')).toBe('/listen/f-r2')
    expect(screen.getByRole('img', { name: '40% read' })).toBeTruthy()
  })

  it('offers to resume listening to an audiobook', async () => {
    setup({ continuing: [reading('r1', 'audio')] })
    expect(
      (await screen.findByRole('link', { name: /Resume listening/ })).getAttribute('href'),
    ).toBe('/listen/f-r1')
  })

  it('searches after a pause, keeping the query in the URL', async () => {
    const { user } = setup()
    await user.type(await screen.findByLabelText('Search the library'), 'dune')
    await waitFor(() => expect(location()).toBe('/?q=dune'))
    await waitFor(() =>
      expect(callsTo('GET /api/books').some((c) => c.query.get('q') === 'dune')).toBe(true),
    )
    // Best match is offered only while searching.
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    expect(await screen.findByRole('option', { name: 'Best match' })).toBeTruthy()
  })

  it('reads filters from the URL and changes the sort and layout', async () => {
    const { user } = setup({
      url: '/?status=reading&scope=mine&sort=bogus&hidden=true&audio=true&series=Dune',
    })
    expect(await screen.findByRole('button', { name: 'Clear series filter' })).toBeTruthy()
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    await user.click(await screen.findByRole('option', { name: 'Title' }))
    await waitFor(() => expect(location()).toContain('sort=title'))
    await user.click(screen.getByRole('button', { name: 'List' }))
    expect(localStorage.getItem('papyrus.libraryLayout')).toBe('list')
  })

  it('says when no Books match the filters', async () => {
    setup({ books: [], url: '/?q=zzz' })
    expect(await screen.findByText('No Books match.')).toBeTruthy()
  })

  it('welcomes an empty library, offering hidden Books', async () => {
    const { user } = setup({ books: [], f: { ...facets, hidden: 2 } })
    expect(await screen.findByText('Your library is empty')).toBeTruthy()
    await user.click(await screen.findByRole('button', { name: 'Show 2 hidden Books' }))
    await waitFor(() => expect(location()).toBe('/?hidden=true'))
  })

  it('uploads from the empty library', async () => {
    const xhrs = installFakeXhr()
    const { user } = setup({ books: [], f: { ...facets, hidden: 1 } })
    expect(await screen.findByRole('button', { name: 'Show 1 hidden Book' })).toBeTruthy()
    const picker = document.querySelector<HTMLInputElement>('input[type=file]') as HTMLInputElement
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await user.upload(picker, new File(['x'], 'a.epub'))
    await waitFor(() => expect(xhrs).toHaveLength(1))
  })

  it('selects Books, and Escape clears the selection', async () => {
    const { user } = setup({ books: [bookSummary()] })
    expect(await screen.findByText('1 Book')).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'Select Dune' }))
    expect(screen.getByRole('toolbar', { name: 'Selected Books' })).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'Select Dune' }))
    expect(screen.queryByRole('toolbar')).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Select Dune' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('on a phone, uses shelf tabs, filter chips and a Filters sheet', async () => {
    Element.prototype.scrollIntoView = () => {}
    const { user } = setup({ width: 400, url: '/?status=finished&author=Frank%20Herbert' })
    expect(await screen.findByRole('tab', { name: 'Sci-fi' })).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Sci-fi' }))
    await waitFor(() => expect(location()).toContain('shelf=s1'))
    await user.click(screen.getByRole('button', { name: 'Clear author filter' }))
    await waitFor(() => expect(location()).not.toContain('author'))
    await user.click(screen.getByRole('button', { name: 'Filters, 1 on' }))
    await user.click(await screen.findByRole('button', { name: 'Show 2 Books' }))
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    await user.click(await screen.findByRole('option', { name: 'Author' }))
    await waitFor(() => expect(location()).toContain('sort=author'))
  })

  it('offline, shows the Books saved on this device', async () => {
    await offlineStore.save(ada.id, {
      id: 'b9',
      title: 'Saved Book',
      authors: [],
      coverUrl: null,
      sharedBy: null,
      files: [],
    })
    setup()
    route('GET /api/books', reply(503))
    route('GET /api/session', { profile: ada })
    expect(await screen.findByText(/You're offline/)).toBeTruthy()
    await offlineStore.removeAll(ada.id)
  })

  it('explains when the library cannot load', async () => {
    setup()
    route('GET /api/books', reply(500))
    expect(await screen.findByText("Couldn't load your library.")).toBeTruthy()
  })

  it('focuses the search field when sent here to search', async () => {
    setViewport(1200)
    route('GET /api/session', { profile: ada })
    route('GET /api/books/facets', facets)
    route('GET /api/shelves', { shelves: [] })
    route('GET /api/books', { books: [bookSummary()], total: 1, nextCursor: null })
    const { router } = renderPage(
      <UploadProvider>
        <LibraryPage />
      </UploadProvider>,
    )
    await screen.findByText('1 Book')
    await act(() => router.navigate('/', { state: { focusSearch: true } }))
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Search the library'),
    )
    // The URL changing elsewhere (Back) refills the field.
    await act(() => router.navigate('/?q=emma'))
    await waitFor(() =>
      expect(screen.getByLabelText('Search the library')).toHaveProperty('value', 'emma'),
    )
  })

  it('loads more Books as they scroll into view', async () => {
    setViewport(1200)
    route('GET /api/session', { profile: ada })
    route('GET /api/books/facets', facets)
    route('GET /api/shelves', { shelves: [] })
    route('GET /api/books', ({ query }) =>
      query.get('cursor')
        ? { books: [bookSummary({ id: 'b2', title: 'Emma' })], total: 2, nextCursor: null }
        : query.get('sort') === 'recent'
          ? { books: [], total: 0, nextCursor: null }
          : { books: [bookSummary()], total: 2, nextCursor: 'next' },
    )
    renderPage(
      <UploadProvider>
        <LibraryPage />
      </UploadProvider>,
    )
    expect(await screen.findByRole('link', { name: /Emma/ })).toBeTruthy()
  })
})
