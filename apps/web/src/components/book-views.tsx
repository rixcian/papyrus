import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { BookSummary } from '@/lib/books'
import { BookCover } from './book-cover'
import { Skeleton } from './ui/skeleton'

export type LibraryLayout = 'grid' | 'list'

const MIN_COLUMN = 144
const GAP_X = 16
const GAP_Y = 24
/** Title, author and series lines under a cover. */
const CAPTION = 72
const LIST_ROW = 72

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/**
 * The library as a grid or a list, rendering only the rows on screen. Rows past the loaded
 * pages show placeholders and ask for the next page (ticket 06).
 */
export function BookViews({
  books,
  total,
  layout,
  hasMore,
  loadMore,
}: {
  books: BookSummary[]
  total: number
  layout: LibraryLayout
  hasMore: boolean
  loadMore: () => void
}) {
  const parent = useRef<HTMLDivElement>(null)
  const width = useWidth(parent)
  const columns =
    layout === 'list' ? 1 : Math.max(2, Math.floor((width + GAP_X) / (MIN_COLUMN + GAP_X)))
  const columnWidth = (width - GAP_X * (columns - 1)) / columns
  const rowHeight = layout === 'list' ? LIST_ROW : columnWidth * 1.5 + CAPTION + GAP_Y
  const count = Math.ceil((hasMore ? total : books.length) / columns)

  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    if (parent.current) setScrollMargin(parent.current.getBoundingClientRect().top + window.scrollY)
  })

  const virtualizer = useWindowVirtualizer({
    count,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin,
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the row shape changes
  useEffect(() => virtualizer.measure(), [virtualizer, rowHeight, columns])

  const rows = virtualizer.getVirtualItems()
  const lastRow = rows.at(-1)?.index ?? 0
  useEffect(() => {
    if (hasMore && (lastRow + 2) * columns >= books.length) loadMore()
  }, [hasMore, lastRow, columns, books.length, loadMore])

  return (
    <div ref={parent}>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {rows.map((row) => {
          const start = row.index * columns
          const slots = Array.from({ length: columns }, (_, i) => start + i).filter(
            (i) => i < (hasMore ? total : books.length),
          )
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
            >
              {layout === 'grid' ? (
                <ul
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    columnGap: GAP_X,
                    paddingBottom: GAP_Y,
                  }}
                >
                  {slots.map((i) => {
                    const book = books[i]
                    return book ? (
                      <BookCard key={book.id} book={book} />
                    ) : (
                      <li key={i} aria-hidden>
                        <Skeleton className="aspect-[2/3] rounded-lg" />
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <ul>
                  {slots.map((i) => {
                    const book = books[i]
                    return book ? (
                      <BookRow key={book.id} book={book} />
                    ) : (
                      <li key={i} aria-hidden className="py-1.5">
                        <Skeleton className="h-15 rounded-md" />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const progressOf = (book: BookSummary) =>
  book.readStatus === 'reading' ? book.lastRead?.fraction : undefined

function seriesLabel(book: BookSummary): string | undefined {
  if (!book.seriesName) return undefined
  return book.seriesIndex != null ? `${book.seriesName} #${book.seriesIndex}` : book.seriesName
}

function BookCard({ book }: { book: BookSummary }) {
  const series = seriesLabel(book)
  return (
    <li>
      <Link to={`/books/${book.id}`} className="flex flex-col gap-2 rounded-lg outline-offset-4">
        <BookCover title={book.title} coverUrl={book.coverUrl} progress={progressOf(book)} />
        <div className="min-w-0">
          <div className="line-clamp-2 font-medium text-sm leading-snug">{book.title}</div>
          {book.authors.length > 0 && (
            <div className="truncate text-muted-foreground text-xs">{book.authors.join(', ')}</div>
          )}
          {series && <div className="truncate text-muted-foreground text-xs">{series}</div>}
          {book.readStatus === 'finished' && (
            <div className="text-muted-foreground text-xs">Finished</div>
          )}
        </div>
      </Link>
    </li>
  )
}

function BookRow({ book }: { book: BookSummary }) {
  const series = seriesLabel(book)
  const progress = progressOf(book)
  return (
    <li>
      <Link
        to={`/books/${book.id}`}
        className="flex h-18 items-center gap-3 rounded-md px-2 hover:bg-accent"
      >
        <BookCover
          title=""
          coverUrl={book.coverUrl}
          className="w-10 shrink-0 rounded-sm shadow-none"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{book.title}</div>
          <div className="truncate text-muted-foreground text-xs">
            {[book.authors.join(', '), series].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {book.readStatus === 'finished'
            ? 'Finished'
            : progress !== undefined
              ? `${Math.round(progress * 100)}%`
              : null}
        </div>
      </Link>
    </li>
  )
}
