import { screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { LibraryQuery } from '@/lib/books'
import { callsTo, reply, route } from '@/test/api'
import { renderPage } from '@/test/render'
import { FilterChips, LibraryFilters, ShelfTabs } from './library-filters'

const many = Array.from({ length: 9 }, (_, i) => ({ name: `Author ${i}`, count: i + 1 }))
const facets = {
  authors: many,
  series: [{ name: 'Dune', count: 3 }],
  tags: [],
  shared: 2,
  hidden: 1,
  audio: 1,
}
const shelves = { shelves: [{ id: 's1', name: 'Sci-fi', count: 4 }] }

/** Keeps the query in state like the library page, and shows it. */
function Harness({ ui, initial = {} }: { ui: 'list' | 'chips'; initial?: LibraryQuery }) {
  const [query, setQuery] = useState<LibraryQuery>(initial)
  const onChange = (patch: Partial<LibraryQuery>) => setQuery((q) => ({ ...q, ...patch }))
  return (
    <>
      {ui === 'list' ? (
        <LibraryFilters query={query} onChange={onChange} />
      ) : (
        <FilterChips query={query} onChange={onChange} />
      )}
      <output data-testid="query">{JSON.stringify(query)}</output>
    </>
  )
}

const query = () => JSON.parse(screen.getByTestId('query').textContent ?? '{}') as LibraryQuery

function setup(ui: 'list' | 'chips', initial: LibraryQuery = {}, f: object = facets) {
  route('GET /api/books/facets', f)
  route('GET /api/shelves', shelves)
  return renderPage(<Harness ui={ui} initial={initial} />)
}

describe('LibraryFilters', () => {
  it('filters by scope, Read Status, audio and facets', async () => {
    const { user } = setup('list')
    await user.click(await screen.findByRole('button', { name: 'Shared with me' }))
    expect(query()).toMatchObject({ scope: 'shared' })
    await user.click(screen.getByRole('button', { name: 'Hidden' }))
    expect(query()).toMatchObject({ hidden: 'true' })
    await user.click(screen.getByRole('button', { name: 'Reading' }))
    expect(query().status).toBe('reading')
    await user.click(screen.getByRole('button', { name: 'Has audio' }))
    expect(query().audio).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Has audio' }))
    expect(query().audio).toBeUndefined()
    await user.click(screen.getByRole('button', { name: /^Dune/ }))
    expect(query().series).toBe('Dune')
    await user.click(screen.getByRole('button', { name: /^Dune/ }))
    expect(query().series).toBeUndefined()
  })

  it('narrows long facet lists', async () => {
    const { user } = setup('list')
    const filter = await screen.findByLabelText('Filter authors')
    await user.type(filter, 'author 3')
    expect(screen.getAllByRole('button', { name: /Author \d/ })).toHaveLength(1)
    await user.clear(filter)
    await user.type(filter, 'zzz')
    expect(screen.getByText('No matches')).toBeTruthy()
  })

  it('hides scopes until something is Shared', async () => {
    setup('list', {}, { ...facets, shared: 0, hidden: 0, audio: 0 })
    await screen.findByText('Authors')
    expect(screen.queryByRole('button', { name: 'Mine' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Has audio' })).toBeNull()
  })

  it('picks, creates, renames and deletes shelves', async () => {
    route('POST /api/shelves', { id: 's2', name: 'Faves' })
    route('PATCH /api/shelves/:id', {})
    route('DELETE /api/shelves/:id', reply(204))
    const { user } = setup('list')
    await user.click(await screen.findByRole('button', { name: /^Sci-fi(?!:)/ }))
    expect(query().shelf).toBe('s1')
    await user.click(screen.getByRole('button', { name: /^Sci-fi(?!:)/ }))
    expect(query().shelf).toBeUndefined()
    await user.click(screen.getByRole('button', { name: /^Sci-fi(?!:)/ }))

    await user.click(screen.getByRole('button', { name: 'New shelf' }))
    await user.type(await screen.findByLabelText('Shelf name'), 'Faves')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(callsTo('POST /api/shelves')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Sci-fi: shelf actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const name = await screen.findByLabelText('Shelf name')
    await user.clear(name)
    await user.type(name, 'SF')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(callsTo('PATCH /api/shelves/:id')[0]?.body).toEqual({ name: 'SF' }))

    await user.click(screen.getByRole('button', { name: 'Sci-fi: shelf actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete shelf' }))
    await waitFor(() => expect(callsTo('DELETE /api/shelves/:id')).toHaveLength(1))
    expect(query().shelf).toBeUndefined()
  })

  it('says when there are no shelves', async () => {
    route('GET /api/books/facets', facets)
    route('GET /api/shelves', { shelves: [] })
    renderPage(<Harness ui="list" />)
    expect(await screen.findByText('No shelves yet')).toBeTruthy()
  })
})

describe('FilterChips', () => {
  it('switches Read Status and toggles audio', async () => {
    const { user } = setup('chips')
    await user.click(screen.getByRole('button', { name: 'Finished' }))
    expect(query().status).toBe('finished')
    await user.click(await screen.findByRole('button', { name: 'Has audio' }))
    expect(query().audio).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Has audio' }))
    expect(query().audio).toBeUndefined()
  })

  it('picks a facet from a chip and clears it', async () => {
    const { user } = setup('chips')
    await user.click(await screen.findByRole('button', { name: 'Series' }))
    await user.click(await screen.findByRole('button', { name: /^Dune/ }))
    expect(query().series).toBe('Dune')
    expect(await screen.findByRole('button', { name: 'Series: Dune' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Clear series filter' }))
    expect(query().series).toBeUndefined()
  })

  it('picks a shelf and a scope, and clears them', async () => {
    const { user } = setup('chips')
    await user.click(await screen.findByRole('button', { name: 'Shelf' }))
    await user.click(await screen.findByRole('button', { name: /^Sci-fi(?!:)/ }))
    expect(await screen.findByRole('button', { name: 'Shelf: Sci-fi' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Clear shelf filter' }))
    expect(query().shelf).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Show' }))
    await user.click(await screen.findByRole('button', { name: 'Mine' }))
    expect(query().scope).toBe('mine')
    await user.click(await screen.findByRole('button', { name: 'Clear scope filter' }))
    expect(query().scope).toBeUndefined()
  })

  it('shows a filter chosen elsewhere even with no facets', async () => {
    setup(
      'chips',
      { tag: 'gone', shelf: 'unknown', hidden: 'true', audio: 'true' },
      {
        ...facets,
        shared: 0,
        hidden: 0,
        audio: 0,
      },
    )
    expect(await screen.findByRole('button', { name: 'Tag: gone' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Shelf: Shelf' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear hidden filter' })).toBeTruthy()
  })
})

function Tabs() {
  const [shelf, setShelf] = useState<string | undefined>()
  return (
    <>
      <ShelfTabs selected={shelf} onSelect={setShelf} />
      <output data-testid="shelf">{shelf ?? 'all'}</output>
    </>
  )
}

describe('ShelfTabs', () => {
  it('switches shelves and creates new ones', async () => {
    route('GET /api/shelves', shelves)
    route('POST /api/shelves', { id: 's2', name: 'Faves' })
    Element.prototype.scrollIntoView = () => {}
    const { user } = renderPage(<Tabs />)
    await user.click(await screen.findByRole('tab', { name: 'Sci-fi' }))
    expect(screen.getByTestId('shelf').textContent).toBe('s1')
    await user.click(screen.getByRole('tab', { name: 'All books' }))
    expect(screen.getByTestId('shelf').textContent).toBe('all')
    await user.click(screen.getByRole('button', { name: 'New shelf' }))
    await user.type(await screen.findByLabelText('Shelf name'), 'Faves')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(callsTo('POST /api/shelves')).toHaveLength(1))
  })
})
