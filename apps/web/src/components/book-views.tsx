import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { HeadphonesIcon } from 'lucide-react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { BookSummary } from '@/lib/books'
import { cn } from '@/lib/utils'
import { formatLength } from '@/player/timeline'
import { BookCover } from './book-cover'
import { Checkbox } from './ui/checkbox'
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

/** Percent read, or for an audiobook the time left: "3 h 05 m left". */
export function progressLabel(book: BookSummary, fraction: number): string {
  const { lastRead } = book
  if (lastRead?.kind === 'audio' && lastRead.duration)
    return `${formatLength((1 - fraction) * lastRead.duration)} left`
  return `${Math.round(fraction * 100)}%`
}

function seriesLabel(book: BookSummary): string | undefined {
  if (!book.seriesName) return undefined
  return book.seriesIndex != null ? `${book.seriesName} #${book.seriesIndex}` : book.seriesName
}

/** Multi-select in the library (ticket 10); absent, cards are plain links. */
export interface Selection {
  selecting: boolean
  has(bookId: string): boolean
  toggle(book: BookSummary): void
}

export const SelectionContext = createContext<Selection | null>(null)

const LONG_PRESS_MS = 500

/**
 * Selection behaviour for a card: in selection mode a click toggles instead of opening the
 * Book, and a long press on touch starts selecting (ticket 10).
 */
function useSelectable(book: BookSummary) {
  const selection = useContext(SelectionContext)
  const timer = useRef<number | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const pressed = useRef(false)
  const cancel = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    origin.current = null
  }
  if (!selection) return { selected: false, selecting: false, linkProps: {}, toggle: () => {} }
  const toggle = () => selection.toggle(book)
  return {
    selected: selection.has(book.id),
    selecting: selection.selecting,
    toggle,
    linkProps: {
      onClick: (e: React.MouseEvent) => {
        if (pressed.current) {
          pressed.current = false
          e.preventDefault()
        } else if (selection.selecting) {
          e.preventDefault()
          toggle()
        }
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return
        pressed.current = false
        origin.current = { x: e.clientX, y: e.clientY }
        timer.current = window.setTimeout(() => {
          pressed.current = true
          navigator.vibrate?.(10)
          toggle()
        }, LONG_PRESS_MS)
      },
      onPointerMove: (e: React.PointerEvent) => {
        const o = origin.current
        if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => {
        if (pressed.current || timer.current) e.preventDefault()
      },
    },
  }
}

function SelectBox({
  book,
  selected,
  selecting,
  toggle,
  className,
}: {
  book: BookSummary
  selected: boolean
  selecting: boolean
  toggle: () => void
  className?: string
}) {
  return (
    <Checkbox
      checked={selected}
      onCheckedChange={toggle}
      aria-label={`Select ${book.title}`}
      className={cn(
        'bg-background',
        // Desktop shows it on hover; touch starts selecting with a long press instead.
        !selecting &&
          'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:hidden',
        className,
      )}
    />
  )
}

function BookCard({ book }: { book: BookSummary }) {
  const series = seriesLabel(book)
  const { selected, selecting, toggle, linkProps } = useSelectable(book)
  return (
    <li className="group relative">
      <Link
        to={`/books/${book.id}`}
        className="flex select-none flex-col gap-2 rounded-lg outline-offset-4 [-webkit-touch-callout:none]"
        {...linkProps}
      >
        <BookCover
          title={book.title}
          coverUrl={book.coverUrl}
          progress={progressOf(book)}
          audio={book.formats.includes('audio')}
          className={cn(selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
        />
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
      <SelectBox
        book={book}
        selected={selected}
        selecting={selecting}
        toggle={toggle}
        className="absolute start-2 top-2"
      />
    </li>
  )
}

function BookRow({ book }: { book: BookSummary }) {
  const series = seriesLabel(book)
  const progress = progressOf(book)
  const { selected, selecting, toggle, linkProps } = useSelectable(book)
  return (
    <li className="group flex items-center gap-1">
      <SelectBox
        book={book}
        selected={selected}
        selecting={selecting}
        toggle={toggle}
        className="ms-2 pointer-coarse:ms-0"
      />
      <Link
        to={`/books/${book.id}`}
        className={cn(
          'flex h-18 min-w-0 flex-1 select-none items-center gap-3 rounded-md px-2 hover:bg-accent [-webkit-touch-callout:none]',
          selected && 'bg-accent',
        )}
        {...linkProps}
      >
        <BookCover
          title=""
          coverUrl={book.coverUrl}
          className="w-10 shrink-0 rounded-sm shadow-none"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate font-medium text-sm">
            <span className="truncate">{book.title}</span>
            {book.formats.includes('audio') && (
              <HeadphonesIcon
                role="img"
                aria-label="Has audiobook"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            )}
          </div>
          <div className="truncate text-muted-foreground text-xs">
            {[book.authors.join(', '), series, book.sharedBy && `Shared by ${book.sharedBy}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {book.readStatus === 'finished'
            ? 'Finished'
            : progress !== undefined
              ? progressLabel(book, progress)
              : null}
        </div>
      </Link>
    </li>
  )
}
