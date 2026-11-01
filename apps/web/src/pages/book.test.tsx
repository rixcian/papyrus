import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { offlineStore } from '@/sync'
import { callsTo, reply, route } from '@/test/api'
import { ada, audioFile, bookDetail, bookFile } from '@/test/fixtures'
import { renderPage } from '@/test/render'
import { BookPage } from './book'

function setup(book = bookDetail(), profileId = ada.id) {
  route('GET /api/session', { profile: { ...ada, id: profileId } })
  route('GET /api/profiles', { profiles: [ada] })
  route('GET /api/shelves', { shelves: [] })
  route('GET /api/books/:id', book)
  return renderPage(<BookPage />, { path: '/books/:bookId', url: `/books/${book.id}` })
}

const location = () => screen.getByTestId('location').textContent

describe('BookPage', () => {
  it('shows the Book’s details', async () => {
    setup(
      bookDetail({
        seriesName: 'Dune',
        seriesIndex: 1,
        share: { mode: 'everyone', profiles: [] },
        tags: ['sf'],
        publisher: 'Chilton',
        isbn: '123',
        description: 'Spice.',
        shelves: [
          { id: 's1', name: 'Sci-fi' },
          { id: 's2', name: 'Faves' },
        ],
        files: [bookFile({ format: 'mobi', id: 'f2', originalName: 'dune.mobi' }), bookFile()],
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Dune' })).toBeTruthy()
    expect(screen.getByText('Dune #1')).toBeTruthy()
    expect(screen.getByText('Shared with everyone')).toBeTruthy()
    expect(screen.getByText('MOBI · EPUB')).toBeTruthy()
    expect(screen.getByText('Chilton')).toBeTruthy()
    expect(screen.getByText('sf')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Faves' }).getAttribute('href')).toBe('/?shelf=s2')
    // An epub reads before a mobi.
    expect(screen.getAllByRole('link', { name: /^Read$/ })[0]?.getAttribute('href')).toBe(
      '/read/f1',
    )
  })

  it('continues the File read last, and listens with the time left', async () => {
    setup(
      bookDetail({
        readStatus: 'reading',
        lastRead: { fileId: 'a1', fraction: 0.5, at: 1, kind: 'audio', duration: 3600 },
        files: [bookFile(), audioFile()],
      }),
    )
    const listen = await screen.findByRole('link', { name: /Listen · .* left/ })
    expect(listen.getAttribute('href')).toBe('/listen/a1')
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText(/2 Tracks/)).toBeTruthy()
  })

  it('continues reading where it stopped', async () => {
    setup(
      bookDetail({
        readStatus: 'finished',
        lastRead: { fileId: 'f1', fraction: 0.25, at: 1, kind: 'text', duration: null },
        files: [bookFile(), audioFile({ duration: null })],
      }),
    )
    expect((await screen.findByRole('link', { name: 'Continue · 25%' })).getAttribute('href')).toBe(
      '/read/f1',
    )
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Yes')).toBeTruthy()
  })

  it('sets the Read Status', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Finished' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Finished' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Finished' }))
  })

  it('expands a long description', async () => {
    const { user } = setup(bookDetail({ description: 'x'.repeat(400) }))
    await user.click(await screen.findByRole('button', { name: 'More' }))
    expect(screen.getByRole('button', { name: 'Less' })).toBeTruthy()
  })

  it('hides a Book Shared with the Profile, and unhides it', async () => {
    route('PUT /api/books/:id/hidden', {})
    const { user } = setup(bookDetail({ owned: false, sharedBy: 'Bob', share: null, hidden: true }))
    expect(await screen.findByText(/Shared by Bob · Hidden from your library/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Unhide' }))
    await waitFor(() =>
      expect(callsTo('PUT /api/books/:id/hidden')[0]?.body).toEqual({ hidden: false }),
    )
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })

  it('opens Share, Edit metadata and Merge for the owner', async () => {
    route('GET /api/books', { books: [], total: 0, nextCursor: null })
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Share' }))
    expect(await screen.findByRole('heading', { name: 'Share Dune' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Edit metadata' }))
    expect(await screen.findByRole('heading', { name: 'Edit metadata' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Merge into…' }))
    expect(await screen.findByText('Merge “Dune” into…')).toBeTruthy()
  })

  it('deletes the Book and goes back to the library', async () => {
    route('DELETE /api/books/:id', reply(204))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete Book' }))
    await waitFor(() => expect(location()).toBe('/'))
  })

  it('splits off and removes Files', async () => {
    route('POST /api/files/:id/split', bookDetail({ id: 'b9' }))
    route('DELETE /api/files/:id', reply(204))
    const { user } = setup(bookDetail({ files: [bookFile(), audioFile()] }))
    const rows = await screen.findAllByRole('listitem')
    const audioRow = rows.find((r) => within(r).queryByText('Audiobook')) as HTMLElement
    await user.click(within(audioRow).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Remove the audiobook?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove File' }))
    await waitFor(() => expect(callsTo('DELETE /api/files/:id')[0]?.path).toBe('/api/files/a1'))

    await user.click(within(audioRow).getByRole('button', { name: 'Split' }))
    await user.click(await screen.findByRole('button', { name: 'Split into new Book' }))
    await waitFor(() => expect(location()).toBe('/books/b9'))
  })

  it('saves the Book offline and removes it again', async () => {
    route('GET /api/files/:id', () => new Response('book'))
    const { user } = setup(bookDetail({ id: 'b-off' }), 'p-book-offline')
    await user.click(await screen.findByRole('button', { name: 'Make available offline' }))
    expect(await screen.findByRole('button', { name: 'Available offline' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Available offline' }))
    expect(await screen.findByRole('button', { name: 'Make available offline' })).toBeTruthy()
  })

  it('asks before saving an audiobook offline, and shows progress and failures', async () => {
    let release: () => void = () => {}
    route(
      'GET /api/files/:id/info',
      () => new Promise((r) => (release = () => r({ duration: 1, tracks: [], chapters: [] }))),
    )
    const { user } = setup(bookDetail({ id: 'b-aud', files: [audioFile()] }), 'p-book-audio')
    await user.click(await screen.findByRole('button', { name: 'Make available offline' }))
    expect(await screen.findByText('Save 47.7 MB on this device?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save offline' }))
    expect(await screen.findByRole('button', { name: /Saving for offline…/ })).toBeTruthy()
    route('GET /api/books/:id', reply(500, { error: 'x', message: 'Server down' }))
    release()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Saving/ })).toBeNull())
  })

  it('shows why a save failed', async () => {
    const { user } = setup(bookDetail({ id: 'b-fail' }), 'p-book-fail')
    await screen.findByRole('button', { name: 'Make available offline' })
    route('GET /api/books/:id', reply(500, { error: 'x', message: 'Server down' }))
    await user.click(screen.getByRole('button', { name: 'Make available offline' }))
    expect(await screen.findByText('Server down')).toBeTruthy()
  })

  it('explains a Book that is gone or not Shared', async () => {
    route('GET /api/session', { profile: ada })
    route('GET /api/books/:id', reply(404, { error: 'not_found', message: 'Nope' }))
    renderPage(<BookPage />, { path: '/books/:bookId', url: '/books/zzz' })
    expect(await screen.findByText(/doesn't exist or isn't Shared with you/)).toBeTruthy()
  })

  it('offline, opens the saved Book from this device', async () => {
    route('GET /api/files/:id', () => new Response('book'))
    await offlineStore.save('p-book-saved', {
      id: 'b-saved',
      title: 'Saved Dune',
      authors: ['Frank Herbert'],
      coverUrl: null,
      sharedBy: null,
      files: [
        { id: 'f1', format: 'epub', originalName: 'a', size: 1 },
        {
          id: 'a1',
          format: 'audio',
          originalName: 'b',
          size: 1,
          audio: { duration: 1, tracks: [], chapters: [] },
        },
      ],
    })
    route('GET /api/session', { profile: { ...ada, id: 'p-book-saved' } })
    route('GET /api/books/:id', reply(503))
    renderPage(<BookPage />, { path: '/books/:bookId', url: '/books/b-saved' })
    expect(await screen.findByText(/You're offline/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Read EPUB/ }).getAttribute('href')).toBe('/read/f1')
    expect(screen.getByRole('link', { name: 'Listen' }).getAttribute('href')).toBe('/listen/a1')
  })
})
