import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { callsTo, reply, route } from '@/test/api'
import { bookDetail } from '@/test/fixtures'
import { renderPage } from '@/test/render'
import { EditBookDialog } from './edit-book-dialog'

const candidate = {
  key: '/works/OL1',
  title: 'Dune',
  authors: ['Frank Herbert'],
  description: 'Spice.',
  publisher: 'Chilton',
  publishedDate: '1965',
  isbn: '9780441013593',
  language: 'en',
  tags: ['Science fiction'],
  coverId: 42,
}

function setup(
  book = bookDetail({ seriesName: 'Dune', seriesIndex: 1, tags: ['sf'], isbn: null }),
) {
  route('PATCH /api/books/:id', book)
  route('PUT /api/books/:id/cover', book)
  const onOpenChange = vi.fn()
  const page = renderPage(<EditBookDialog book={book} open onOpenChange={onOpenChange} />)
  return { ...page, onOpenChange }
}

describe('EditBookDialog', () => {
  it('saves the edited metadata', async () => {
    const { user, onOpenChange } = setup()
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Dune Messiah')
    await user.clear(screen.getByLabelText('Authors, one per line'))
    await user.type(
      screen.getByLabelText('Authors, one per line'),
      'Frank Herbert{enter} {enter}Brian',
    )
    await user.clear(screen.getByLabelText('Number in series'))
    await user.type(screen.getByLabelText('Number in series'), '2')
    await user.type(screen.getByLabelText('Tags, comma-separated'), ', , classic')
    await user.type(screen.getByLabelText('Description'), 'Sequel')
    await user.type(screen.getByLabelText('Publisher'), 'Putnam')
    await user.type(screen.getByLabelText('Published'), '1969')
    await user.type(screen.getByLabelText('Language'), 'en')
    await user.type(screen.getByLabelText('ISBN'), '123')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(callsTo('PATCH /api/books/:id')[0]?.body).toEqual({
      title: 'Dune Messiah',
      authors: ['Frank Herbert', 'Brian'],
      seriesName: 'Dune',
      seriesIndex: 2,
      tags: ['sf', 'classic'],
      description: 'Sequel',
      publisher: 'Putnam',
      publishedDate: '1969',
      language: 'en',
      isbn: '123',
    })
    expect(callsTo('PUT /api/books/:id/cover')).toHaveLength(0)
  })

  it('rejects a series number that is not a number, and clears an empty one', async () => {
    const { user } = setup()
    const index = screen.getByLabelText('Number in series')
    await user.clear(index)
    await user.type(index, 'two')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Series number must be a number')).toBeTruthy()
    await user.clear(index)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(callsTo('PATCH /api/books/:id')[0]?.body).toMatchObject({ seriesIndex: null }),
    )
  })

  it('shows save failures, and cancels', async () => {
    const { user, onOpenChange } = setup()
    route('PATCH /api/books/:id', reply(400, { error: 'x', message: 'Title too long' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Title too long')).toBeTruthy()
    route('PATCH /api/books/:id', () => Promise.reject(new Error('x')))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Something went wrong')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('finds metadata online, copies the ticked fields and the cover, and saves both', async () => {
    route('GET /api/metadata/lookup', {
      candidates: [
        candidate,
        { ...candidate, key: '/works/OL2', title: 'Other', coverId: null, isbn: null },
      ],
    })
    const { user, onOpenChange } = setup()
    await user.click(screen.getByRole('button', { name: /Find online/ }))
    await user.click(await screen.findByRole('button', { name: /^Dune/ }))
    expect(callsTo('GET /api/metadata/lookup')[0]?.query.get('title')).toBe('Dune')

    // Empty fields come pre-ticked; Tags differ from the form, so they are offered unticked.
    expect(screen.getByRole('checkbox', { name: /Description/ }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(screen.getByRole('checkbox', { name: /Tags/ }).getAttribute('aria-checked')).toBe(
      'false',
    )
    expect(screen.getByText('Now: sf')).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: /Tags/ }))
    await user.click(screen.getByRole('checkbox', { name: /Language/ }))
    await user.click(screen.getByRole('button', { name: /Copy 6 into the form/ }))

    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Spice.')
    expect(screen.getByLabelText('Language')).toHaveProperty('value', '')
    expect(screen.getByText(/The cover from Open Library/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(callsTo('PUT /api/books/:id/cover')[0]?.body).toEqual({ coverId: 42 })
  })

  it('can keep the current cover after picking one', async () => {
    route('GET /api/metadata/lookup', { candidates: [candidate] })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Find online/ }))
    await user.click(await screen.findByRole('button', { name: /Chilton/ }))
    await user.click(screen.getByRole('button', { name: /Copy/ }))
    await user.click(screen.getByRole('button', { name: 'Keep current cover' }))
    expect(screen.queryByText(/The cover from Open Library/)).toBeNull()
  })
})

describe('FindOnline', () => {
  it('searches with Enter, shows errors and empty results, and goes back', async () => {
    route('GET /api/metadata/lookup', ({ query }) =>
      query.get('isbn') === '1'
        ? reply(502, { error: 'x', message: 'Open Library is down' })
        : { candidates: [] },
    )
    const { user } = setup(bookDetail({ title: '', authors: [], isbn: null }))
    await user.click(screen.getByRole('button', { name: /Find online/ }))
    expect(screen.getByRole('button', { name: 'Search' })).toHaveProperty('disabled', true)
    await user.type(screen.getByLabelText('ISBN'), '1{enter}')
    expect(await screen.findByText('Open Library is down')).toBeTruthy()

    await user.clear(screen.getByLabelText('ISBN'))
    await user.type(screen.getByLabelText('Title'), 'Zzz')
    await user.type(screen.getByLabelText('Author'), 'Nobody')
    await user.keyboard('a')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText(/Nothing found/)).toBeTruthy()
    expect(callsTo('GET /api/metadata/lookup').at(-1)?.query.get('author')).toBe('Nobodya')

    await user.click(screen.getByRole('button', { name: 'Back to the form' }))
    expect(screen.getByRole('heading', { name: 'Edit metadata' })).toBeTruthy()
  })

  it('says when a match adds nothing new, and goes back to the results', async () => {
    const same = {
      ...candidate,
      coverId: null,
      description: null,
      publisher: null,
      publishedDate: null,
      isbn: null,
      language: null,
      tags: [],
    }
    route('GET /api/metadata/lookup', { candidates: [same] })
    const { user } = setup(bookDetail({ isbn: null }))
    await user.click(screen.getByRole('button', { name: /Find online/ }))
    await user.click(await screen.findByRole('button', { name: /Dune/ }))
    expect(screen.getByText('Nothing here differs from the form.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Copy/ })).toHaveProperty('disabled', true)
    await user.click(screen.getByRole('button', { name: 'Back to results' }))
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
  })

  it('leaves the cover unticked when the Book has one', async () => {
    route('GET /api/metadata/lookup', { candidates: [candidate] })
    const { user } = setup(bookDetail({ coverUrl: '/c.jpg', isbn: '9780441013593' }))
    await user.click(screen.getByRole('button', { name: /Find online/ }))
    await user.click(await screen.findByRole('button', { name: /Chilton/ }))
    expect(screen.getByRole('checkbox', { name: /Cover/ }).getAttribute('aria-checked')).toBe(
      'false',
    )
    await user.click(screen.getByRole('checkbox', { name: /Cover/ }))
    await user.click(screen.getByRole('checkbox', { name: /Cover/ }))
  })

  it('does not search on open with nothing to search for', async () => {
    const { user } = setup(bookDetail({ title: '', isbn: null }))
    await user.click(screen.getByRole('button', { name: /Find online/ }))
    await user.type(screen.getByLabelText('Author'), '{enter}')
    expect(callsTo('GET /api/metadata/lookup')).toHaveLength(0)
  })
})
