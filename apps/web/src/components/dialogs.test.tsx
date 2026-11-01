import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import type { ShareState } from '@/lib/books'
import { callsTo, reply, route } from '@/test/api'
import { ada, bob, bookDetail, bookSummary } from '@/test/fixtures'
import { renderPage } from '@/test/render'
import { ImportsSection } from './imports-section'
import { MergeDialog } from './merge-dialog'
import { describeShare, ShareDialog } from './share-dialog'
import { ShelfNameDialog } from './shelf-dialogs'
import { ShelvesMenu } from './shelves-menu'

describe('ImportsSection', () => {
  it('explains how to turn the import folder on', async () => {
    route('GET /api/imports', { enabled: false, folder: null, pollSeconds: 5, records: [] })
    renderPage(<ImportsSection />)
    expect(await screen.findByText('PAPYRUS_IMPORT_DIR')).toBeTruthy()
  })

  it('says when nothing is imported yet, polling every second', async () => {
    route('GET /api/imports', { enabled: true, folder: 'ada', pollSeconds: 1, records: [] })
    renderPage(<ImportsSection />)
    expect(await screen.findByText('Nothing imported yet.')).toBeTruthy()
    expect(screen.getByText(/checked every second/)).toBeTruthy()
  })

  it('lists what happened to each file', async () => {
    route('GET /api/imports', {
      enabled: true,
      folder: 'ada',
      pollSeconds: 10,
      records: [
        { path: 'dune.epub', status: 'created', bookId: 'b1', title: 'Dune', message: null, at: 0 },
        {
          path: 'bad.epub',
          status: 'failed',
          bookId: null,
          title: null,
          message: 'Not an epub',
          at: 0,
        },
        { path: 'odd.epub', status: 'weird', bookId: null, title: null, message: null, at: 0 },
      ],
    })
    renderPage(<ImportsSection />)
    expect((await screen.findByRole('link', { name: 'Dune' })).getAttribute('href')).toBe(
      '/books/b1',
    )
    expect(screen.getByText('New Book')).toBeTruthy()
    expect(screen.getByText('Not an epub')).toBeTruthy()
    expect(screen.getByText('weird')).toBeTruthy()
    expect(screen.getByText(/every 10 seconds/)).toBeTruthy()
  })
})

describe('ShelfNameDialog', () => {
  function setup(onSubmit: (name: string) => Promise<unknown>) {
    const onOpenChange = vi.fn()
    const page = renderPage(
      <ShelfNameDialog
        open
        onOpenChange={onOpenChange}
        title="Rename"
        initial="SF"
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )
    return { ...page, onOpenChange }
  }

  it('saves the trimmed name and closes', async () => {
    const onSubmit = vi.fn(async () => {})
    const { user, onOpenChange } = setup(onSubmit)
    const input = screen.getByLabelText('Shelf name')
    await user.clear(input)
    await user.type(input, '  Sci-fi ')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith('Sci-fi')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows why saving failed, and cancels', async () => {
    const { user, onOpenChange } = setup(() => Promise.reject(new Error('x')))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Couldn’t save the shelf')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('ShelvesMenu', () => {
  const shelves = {
    shelves: [
      { id: 's1', name: 'Sci-fi', bookCount: 1 },
      { id: 's2', name: 'Faves', bookCount: 0 },
    ],
  }

  it('toggles a single Book on and off shelves', async () => {
    route('GET /api/shelves', shelves)
    route('POST /api/shelves/:id/books', {})
    const { user } = renderPage(
      <ShelvesMenu bookIds={['b1']} onShelves={['s1']} trigger={<Button>Shelves</Button>} />,
    )
    await user.click(screen.getByRole('button', { name: 'Shelves' }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Sci-fi' }))
    await waitFor(() => expect(callsTo('POST /api/shelves/:id/books')).toHaveLength(1))
    expect(callsTo('POST /api/shelves/:id/books')[0]?.body).toEqual({ add: [], remove: ['b1'] })
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Faves' }))
    await waitFor(() => expect(callsTo('POST /api/shelves/:id/books')).toHaveLength(2))
    expect(callsTo('POST /api/shelves/:id/books')[1]).toMatchObject({
      path: '/api/shelves/s2/books',
      body: { add: ['b1'] },
    })
  })

  it('adds a multi-select to a shelf', async () => {
    route('GET /api/shelves', shelves)
    route('POST /api/shelves/:id/books', {})
    const onDone = vi.fn()
    const { user } = renderPage(
      <ShelvesMenu bookIds={['b1', 'b2']} trigger={<Button>Shelves</Button>} onDone={onDone} />,
    )
    await user.click(screen.getByRole('button', { name: 'Shelves' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Faves' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(callsTo('POST /api/shelves/:id/books')[0]?.body).toEqual({
      add: ['b1', 'b2'],
      remove: [],
    })
  })

  it('creates a new shelf with the Books on it', async () => {
    route('GET /api/shelves', { shelves: [] })
    route('POST /api/shelves', { id: 's9', name: 'New' })
    route('POST /api/shelves/:id/books', {})
    const onDone = vi.fn()
    const { user } = renderPage(
      <ShelvesMenu bookIds={['b1']} trigger={<Button>Shelves</Button>} onDone={onDone} />,
    )
    await user.click(screen.getByRole('button', { name: 'Shelves' }))
    await user.click(await screen.findByRole('menuitem', { name: /New shelf/ }))
    await user.type(await screen.findByLabelText('Shelf name'), 'New')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(callsTo('POST /api/shelves/:id/books')[0]?.path).toBe('/api/shelves/s9/books')
  })
})

describe('describeShare', () => {
  it('reads the Share', () => {
    expect(describeShare({ mode: 'none', profiles: [] })).toBe('Not shared')
    expect(describeShare({ mode: 'everyone', profiles: [] })).toBe('Shared with everyone')
    expect(
      describeShare({
        mode: 'named',
        profiles: [
          { id: '1', name: 'Bob' },
          { id: '2', name: 'Cy' },
        ],
      }),
    ).toBe('Shared with Bob, Cy')
  })
})

describe('ShareDialog', () => {
  const cy = { id: 'p-cy', name: 'Cy', colour: 'red' as const }

  function setup(share: ShareState = { mode: 'none', profiles: [] }) {
    route('GET /api/session', { profile: ada })
    route('GET /api/profiles', { profiles: [ada, bob, cy] })
    route('PUT /api/books/:id/share', {})
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    const page = renderPage(
      <ShareDialog
        bookIds={['b1']}
        title="Share Dune"
        share={share}
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />,
    )
    return { ...page, onOpenChange, onSaved }
  }

  it('shares with named Profiles', async () => {
    const { user, onSaved } = setup({ mode: 'named', profiles: [{ id: cy.id, name: 'Cy' }] })
    await user.click(await screen.findByRole('checkbox', { name: 'Bob' }))
    await user.click(screen.getByRole('checkbox', { name: 'Cy' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsTo('PUT /api/books/:id/share')[0]?.body).toEqual({
      mode: 'named',
      profileIds: [bob.id],
    })
  })

  it('shares with everyone', async () => {
    const { user, onSaved } = setup()
    await user.click(await screen.findByRole('radio', { name: /Everyone/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsTo('PUT /api/books/:id/share')[0]?.body).toEqual({
      mode: 'everyone',
      profileIds: [],
    })
  })

  it('shows a failure and cancels', async () => {
    const { user, onOpenChange } = setup()
    route('PUT /api/books/:id/share', reply(500, { error: 'x', message: 'Server sad' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Server sad')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('explains when there is nobody else to Share with', async () => {
    route('GET /api/session', { profile: ada })
    route('GET /api/profiles', { profiles: [ada] })
    renderPage(
      <ShareDialog
        bookIds={['b1']}
        title="Share"
        share={{ mode: 'none', profiles: [] }}
        open
        onOpenChange={() => {}}
      />,
    )
    expect(await screen.findByText(/There are no other Profiles yet/)).toBeTruthy()
  })

  it('has a generic message for unexpected failures', async () => {
    const { user } = setup()
    route('PUT /api/books/:id/share', () => Promise.reject(new Error('x')))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Couldn’t save the Share')).toBeTruthy()
  })
})

describe('MergeDialog', () => {
  it('merges into the chosen Book and opens it', async () => {
    route('GET /api/books', ({ query }) => ({
      books: query.get('q')
        ? [bookSummary({ id: 'b3', title: 'Children of Dune' })]
        : [
            bookSummary(),
            bookSummary({ id: 'b2', title: 'Dune Messiah', formats: ['epub', 'mobi'] }),
          ],
      total: 2,
      nextCursor: null,
    }))
    route('POST /api/books/:id/merge', {})
    const onOpenChange = vi.fn()
    const { user } = renderPage(
      <MergeDialog book={bookDetail()} open onOpenChange={onOpenChange} />,
      {
        path: '/books/:bookId',
        url: '/books/b1',
      },
    )
    const list = await screen.findByRole('list', { name: 'Your Books' })
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(1))
    expect(screen.getByText('Frank Herbert · EPUB, MOBI')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Merge' })).toHaveProperty('disabled', true)

    await user.type(screen.getByLabelText('Find a Book'), 'children')
    await user.click(await screen.findByRole('button', { name: /Children of Dune/ }))
    await user.click(screen.getByRole('button', { name: 'Merge into “Children of Dune”' }))
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/books/b3'))
    expect(callsTo('POST /api/books/:id/merge')[0]?.body).toEqual({ targetId: 'b3' })
  })

  it('says when no other Book matches, and shows merge failures', async () => {
    route('GET /api/books', { books: [bookSummary()], total: 1, nextCursor: null })
    const onOpenChange = vi.fn()
    const { user } = renderPage(
      <MergeDialog book={bookDetail()} open onOpenChange={onOpenChange} />,
    )
    expect(await screen.findByText('No other Books of yours match.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows why a merge failed', async () => {
    route('GET /api/books', {
      books: [bookSummary({ id: 'b2', title: 'Other' })],
      total: 1,
      nextCursor: null,
    })
    route('POST /api/books/:id/merge', reply(409, { error: 'x', message: 'Can’t merge' }))
    const { user } = renderPage(<MergeDialog book={bookDetail()} open onOpenChange={() => {}} />)
    await user.click(await screen.findByRole('button', { name: /Other/ }))
    await user.click(screen.getByRole('button', { name: 'Merge into “Other”' }))
    expect(await screen.findByText('Can’t merge')).toBeTruthy()
  })
})
