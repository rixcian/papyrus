import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { BookSummary } from '@/lib/books'
import { bookSummary } from '@/test/fixtures'
import { renderPage } from '@/test/render'
import { BookViews, progressLabel, type Selection, SelectionContext } from './book-views'

const books = [
  bookSummary({ id: 'b1', title: 'Dune', seriesName: 'Dune', seriesIndex: 1 }),
  bookSummary({
    id: 'b2',
    title: 'Emma',
    authors: [],
    seriesName: 'Austen',
    readStatus: 'reading',
    lastRead: { fileId: 'f', fraction: 0.25, at: 1, kind: 'text', duration: null },
    sharedBy: 'Bob',
  }),
  bookSummary({ id: 'b3', title: 'Quiet Shore', formats: ['audio'], readStatus: 'finished' }),
]

function Selectable({ layout, initial = [] }: { layout: 'grid' | 'list'; initial?: string[] }) {
  const [ids, setIds] = useState(new Set(initial))
  const selection: Selection = {
    selecting: ids.size > 0,
    has: (id) => ids.has(id),
    toggle: (book: BookSummary) =>
      setIds((prev) => {
        const next = new Set(prev)
        if (next.has(book.id)) next.delete(book.id)
        else next.add(book.id)
        return next
      }),
  }
  return (
    <SelectionContext.Provider value={selection}>
      <BookViews books={books} total={3} layout={layout} hasMore={false} loadMore={() => {}} />
      <output data-testid="selected">{[...ids].join(',')}</output>
    </SelectionContext.Provider>
  )
}

const selected = () => screen.getByTestId('selected').textContent

describe('BookViews', () => {
  it('lays Books out as a grid of linked cards', () => {
    renderPage(
      <BookViews books={books} total={3} layout="grid" hasMore={false} loadMore={() => {}} />,
    )
    expect(screen.getByRole('link', { name: /Dune #1/ }).getAttribute('href')).toBe('/books/b1')
    expect(screen.getByText('Finished')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Has audiobook' })).toBeTruthy()
  })

  it('lays Books out as a list with progress and who shared them', () => {
    renderPage(
      <BookViews books={books} total={3} layout="list" hasMore={false} loadMore={() => {}} />,
    )
    expect(screen.getByText('Austen · Shared by Bob')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText('Finished')).toBeTruthy()
  })

  it.each(['grid', 'list'] as const)(
    'shows placeholders past the loaded Books and asks for more (%s)',
    async (layout) => {
      const loadMore = vi.fn()
      const { container } = renderPage(
        <BookViews books={books} total={6} layout={layout} hasMore loadMore={loadMore} />,
      )
      await waitFor(() => expect(loadMore).toHaveBeenCalled())
      expect(container.querySelectorAll('li[aria-hidden]').length).toBe(3)
    },
  )

  it.each(['grid', 'list'] as const)(
    'selects with the checkbox, then with a click (%s)',
    async (layout) => {
      const { user } = renderPage(<Selectable layout={layout} />)
      await user.click(screen.getByRole('checkbox', { name: 'Select Dune' }))
      expect(selected()).toBe('b1')
      await user.click(screen.getByRole('link', { name: /Emma/ }))
      expect(selected()).toBe('b1,b2')
      expect(screen.getByTestId('location').textContent).toBe('/')
    },
  )

  it('opens the Book on click when not selecting', async () => {
    const { user } = renderPage(<Selectable layout="grid" />)
    await user.click(screen.getByRole('link', { name: /Emma/ }))
    expect(screen.getByTestId('location').textContent).toBe('/books/b2')
  })

  it('starts selecting with a long press on touch, but not when the finger moves', () => {
    vi.useFakeTimers()
    renderPage(<Selectable layout="grid" />)
    const link = screen.getByRole('link', { name: /Quiet Shore/ })
    fireEvent.pointerDown(link, { pointerType: 'mouse' })
    fireEvent.pointerDown(link, { pointerType: 'touch', clientX: 0, clientY: 0 })
    fireEvent.pointerMove(link, { clientX: 2, clientY: 2 })
    fireEvent.contextMenu(link)
    act(() => vi.advanceTimersByTime(600))
    fireEvent.pointerUp(link)
    expect(selected()).toBe('b3')
    // The click that ends a long press doesn't also toggle or open.
    fireEvent.click(link)
    expect(selected()).toBe('b3')
    fireEvent.contextMenu(link)

    fireEvent.pointerDown(link, { pointerType: 'touch', clientX: 0, clientY: 0 })
    fireEvent.pointerMove(link, { clientX: 40, clientY: 0 })
    fireEvent.pointerMove(link, { clientX: 50, clientY: 0 })
    act(() => vi.advanceTimersByTime(600))
    fireEvent.pointerCancel(link)
    expect(selected()).toBe('b3')
    vi.useRealTimers()
  })
})

describe('progressLabel', () => {
  it('shows percent read, or time left for an audiobook', () => {
    const audio = bookSummary({
      lastRead: { fileId: 'a', fraction: 0.5, at: 1, kind: 'audio', duration: 7200 },
    })
    expect(progressLabel(audio, 0.5)).toMatch(/left$/)
    expect(progressLabel(bookSummary(), 0.333)).toBe('33%')
  })
})
