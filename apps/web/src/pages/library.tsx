import {
  ArrowDownUpIcon,
  BookOpenIcon,
  HeadphonesIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Ambient } from '@/components/ambient'
import { LIBRARY_SEARCH_ID } from '@/components/app-shell'
import { BookCover } from '@/components/book-cover'
import {
  BookViews,
  type LibraryLayout,
  progressLabel,
  type Selection,
  SelectionContext,
} from '@/components/book-views'
import { FilterChips, LibraryFilters, ShelfTabs } from '@/components/library-filters'
import { OfflineLibrary } from '@/components/offline-library'
import { SelectionBar } from '@/components/selection-bar'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useUploads } from '@/components/uploads'
import { useMediaQuery } from '@/hooks/use-media-query'
import {
  type BookSort,
  type BookSummary,
  type LibraryQuery,
  useBookList,
  useContinueReading,
  useFacets,
} from '@/lib/books'
import { isUnreachable } from '@/lib/offline'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { ReadStatus } from '@/sync'

const SORTS: { value: BookSort; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'series', label: 'Series' },
]
const STATUS_LABELS: Record<ReadStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  finished: 'Finished',
}
const SCOPE_LABELS = { all: 'All', mine: 'Mine', shared: 'Shared with me' } as const
const LAYOUT_KEY = 'papyrus.libraryLayout'

const isStatus = (v: string | null): v is ReadStatus =>
  v === 'unread' || v === 'reading' || v === 'finished'
const isScope = (v: string | null): v is 'mine' | 'shared' => v === 'mine' || v === 'shared'
const isSort = (v: string | null): v is BookSort => SORTS.some((s) => s.value === v)

/** Search, filters and sort live in the URL, so they survive reloads and Back (ticket 06). */
function useLibraryQuery(): [LibraryQuery, (patch: Partial<LibraryQuery>) => void] {
  const [params, setParams] = useSearchParams()
  const get = (key: string) => params.get(key) || undefined
  const status = params.get('status')
  const sort = params.get('sort')
  const scope = params.get('scope')
  const query: LibraryQuery = {
    ...(get('q') && { q: get('q') }),
    ...(isStatus(status) && { status }),
    ...(get('author') && { author: get('author') }),
    ...(get('series') && { series: get('series') }),
    ...(get('tag') && { tag: get('tag') }),
    ...(isSort(sort) && { sort }),
    ...(isScope(scope) && { scope }),
    ...(get('shelf') && { shelf: get('shelf') }),
    ...(params.get('hidden') === 'true' && { hidden: 'true' }),
    ...(params.get('audio') === 'true' && { audio: 'true' }),
  }
  const update = useCallback(
    (patch: Partial<LibraryQuery>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, String(value))
            else next.delete(key)
          }
          return next
        },
        { replace: 'q' in patch },
      ),
    [setParams],
  )
  return [query, update]
}

function useLayout(): [LibraryLayout, (layout: LibraryLayout) => void] {
  const [layout, setLayout] = useState<LibraryLayout>(() =>
    localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid',
  )
  return [
    layout,
    (next) => {
      localStorage.setItem(LAYOUT_KEY, next)
      setLayout(next)
    },
  ]
}

export function LibraryPage() {
  const [query, update] = useLibraryQuery()
  const [layout, setLayout] = useLayout()
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Desktop gets the chip row; phones the shelf tabs and a Filters sheet.
  const wide = useMediaQuery('sm')
  const list = useBookList(query)
  const continuing = useContinueReading()
  const { data: profile } = useSession()
  const hiddenCount = useFacets().data?.hidden ?? 0
  const [selected, setSelected] = useState<Map<string, BookSummary>>(() => new Map())
  const clearSelection = useCallback(() => setSelected(new Map()), [])
  const selection = useMemo<Selection>(
    () => ({
      selecting: selected.size > 0,
      has: (id) => selected.has(id),
      toggle: (book) =>
        setSelected((prev) => {
          const next = new Map(prev)
          if (next.has(book.id)) next.delete(book.id)
          else next.set(book.id, book)
          return next
        }),
    }),
    [selected],
  )
  useEffect(() => {
    if (!selected.size) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && clearSelection()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size, clearSelection])
  const { addFiles } = useUploads()
  const input = useRef<HTMLInputElement>(null)

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = list
  const loadMore = useCallback(() => {
    if (!isFetchingNextPage) void fetchNextPage()
  }, [fetchNextPage, isFetchingNextPage])
  const search = useCallback((q: string) => update({ q }), [update])

  const picker = (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <Button className="rounded-full" onClick={() => input.current?.click()}>
        <UploadIcon />
        Upload
      </Button>
    </>
  )

  if (list.isPending) return null
  if (list.isError)
    return isUnreachable(list.error) && profile ? (
      <OfflineLibrary profileId={profile.id} />
    ) : (
      <p className="text-destructive-foreground">Couldn't load your library.</p>
    )

  const filtered = Object.keys(query).some((k) => k !== 'sort')
  const books = list.data.pages.flatMap((p) => p.books)
  const total = list.data.pages[0]?.total ?? 0

  if (total === 0 && !filtered)
    return (
      <div className="grid place-items-center py-24 text-center">
        <div className="flex animate-rise flex-col items-center gap-4">
          <div>
            <h1 className="font-semibold text-xl">Your library is empty</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Upload epub or mobi files, drop them anywhere on this page, or put them in your import
              folder.
            </p>
          </div>
          {picker}
          {hiddenCount > 0 && (
            <Button variant="link" onClick={() => update({ hidden: 'true' })}>
              Show {hiddenCount} hidden {hiddenCount === 1 ? 'Book' : 'Books'}
            </Button>
          )}
        </div>
      </div>
    )

  // Phones show the shelf in the tabs, so its chip is only for the other filters.
  const chips = (
    [
      ['scope', query.scope && SCOPE_LABELS[query.scope]],
      ['hidden', query.hidden && 'Hidden'],
      ['audio', query.audio && 'Has audio'],
      ['status', query.status && STATUS_LABELS[query.status]],
      ['author', query.author],
      ['series', query.series],
      ['tag', query.tag],
    ] as const
  ).filter(([, label]) => label)
  const sort = query.sort ?? (query.q ? 'relevance' : query.series ? 'series' : 'added')
  const sortItems = SORTS.filter((s) => s.value !== 'relevance' || query.q)

  return (
    <div className="flex flex-col gap-8">
      {!filtered && continuing.data && continuing.data.length > 0 && (
        <ContinueReading books={continuing.data} />
      )}

      <section className="min-w-0 animate-rise [animation-delay:80ms]">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="font-semibold text-2xl tracking-tight">Library</h1>
          <span className="mt-1 text-muted-foreground text-sm tabular-nums">
            {total} {total === 1 ? 'Book' : 'Books'}
          </span>
          <div className="flex-1" />
          {wide && (
            <>
              <Select
                items={sortItems}
                value={sort}
                onValueChange={(value) => update({ sort: value as BookSort })}
              >
                <SelectTrigger className="w-auto min-w-36 rounded-full" aria-label="Sort by">
                  <ArrowDownUpIcon className="size-4 opacity-70" />
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {sortItems.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <LayoutToggle layout={layout} onChange={setLayout} />
            </>
          )}
          {picker}
        </div>

        {wide ? (
          <div className="mb-6 flex flex-col gap-3">
            <SearchBox value={query.q ?? ''} onChange={search} />
            <FilterChips query={query} onChange={update} />
          </div>
        ) : (
          <div className="mb-4 flex flex-col gap-3">
            <ShelfTabs selected={query.shelf} onSelect={(shelf) => update({ shelf })} />
            <div className="flex items-center gap-2">
              <SearchBox value={query.q ?? ''} onChange={search} />
              <Button
                variant={chips.length ? 'default' : 'outline'}
                size="icon"
                className="shrink-0 rounded-full"
                aria-label={chips.length ? `Filters, ${chips.length} on` : 'Filters'}
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontalIcon />
              </Button>
            </div>
            {chips.length > 0 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                {chips.map(([key, label]) => (
                  <span
                    key={key}
                    className="inline-flex h-8 shrink-0 animate-pop items-center gap-1 rounded-full bg-primary ps-3 pe-1 font-medium text-primary-foreground text-sm"
                  >
                    {label}
                    <button
                      type="button"
                      aria-label={`Clear ${key} filter`}
                      className="grid size-6 place-items-center rounded-full hover:bg-black/10"
                      onClick={() => update({ [key]: undefined })}
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Select
                items={sortItems}
                value={sort}
                onValueChange={(value) => update({ sort: value as BookSort })}
              >
                <SelectTrigger
                  size="sm"
                  className="w-auto min-w-32 rounded-full"
                  aria-label="Sort by"
                >
                  <ArrowDownUpIcon className="size-3.5 opacity-70" />
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {sortItems.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <div className="flex-1" />
              <LayoutToggle layout={layout} onChange={setLayout} />
            </div>
          </div>
        )}

        {total === 0 ? (
          <p className="py-12 text-center text-muted-foreground text-sm">No Books match.</p>
        ) : (
          <SelectionContext.Provider value={selection}>
            <BookViews
              books={books}
              total={total}
              layout={layout}
              hasMore={hasNextPage}
              loadMore={loadMore}
            />
          </SelectionContext.Provider>
        )}
      </section>

      {selected.size > 0 && (
        <SelectionBar
          books={[...selected.values()]}
          hiddenView={query.hidden === 'true'}
          onClear={clearSelection}
        />
      )}

      {!wide && (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetPopup side="bottom">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <SheetPanel>
              <LibraryFilters query={query} onChange={update} />
            </SheetPanel>
            <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button
                size="lg"
                className="w-full rounded-full"
                onClick={() => setFiltersOpen(false)}
              >
                Show {total} {total === 1 ? 'Book' : 'Books'}
              </Button>
            </div>
          </SheetPopup>
        </Sheet>
      )}
    </div>
  )
}

function LayoutToggle({
  layout,
  onChange,
}: {
  layout: LibraryLayout
  onChange: (layout: LibraryLayout) => void
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      className="rounded-full *:rounded-full"
      value={[layout]}
      onValueChange={(value) => value[0] && onChange(value[0] as LibraryLayout)}
    >
      <ToggleGroupItem value="grid" aria-label="Grid">
        <LayoutGridIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List">
        <ListIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

const resumeHref = (book: BookSummary) =>
  `/${book.lastRead?.kind === 'audio' ? 'listen' : 'read'}/${book.lastRead?.fileId}`

/**
 * The Book read last leads, large and tinted with its own cover colour; the others in progress
 * follow in a row.
 */
function ContinueReading({ books }: { books: BookSummary[] }) {
  const [first, ...rest] = books
  if (!first) return null
  const fraction = first.lastRead?.fraction ?? 0
  const audio = first.lastRead?.kind === 'audio'
  return (
    <section aria-labelledby="continue-heading" className="flex flex-col gap-6">
      <Ambient coverUrl={first.coverUrl} />
      <div className="flex flex-col items-center gap-6 pt-2 text-center sm:flex-row sm:items-center sm:gap-10 sm:pt-6 sm:text-start">
        <Link
          to={`/books/${first.id}`}
          aria-label={`${first.title}: details`}
          className="w-36 shrink-0 animate-cover-in rounded-lg sm:w-44"
        >
          <BookCover
            title={first.title}
            coverUrl={first.coverUrl}
            audio={audio}
            className="animate-float shadow-2xl shadow-black/60 [transform-style:preserve-3d]"
          />
        </Link>
        <div className="flex min-w-0 animate-rise flex-col items-center gap-1 sm:items-start">
          <h2 id="continue-heading" className="font-medium text-muted-foreground text-sm">
            Continue reading
          </h2>
          <p className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
            {first.title}
          </p>
          {first.authors.length > 0 && (
            <p className="text-muted-foreground">{first.authors.join(', ')}</p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button
              size="lg"
              className="rounded-full px-5"
              render={<Link to={resumeHref(first)} />}
            >
              {audio ? <HeadphonesIcon /> : <BookOpenIcon />}
              {audio ? 'Resume listening' : 'Resume reading'}
            </Button>
            <ProgressRing
              fraction={fraction}
              label={audio ? progressLabel(first, fraction) : undefined}
            />
          </div>
        </div>
      </div>
      {rest.length > 0 && (
        <ul
          aria-label="Also in progress"
          className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        >
          {rest.map((book, i) => (
            <li
              key={book.id}
              className="w-60 shrink-0 animate-rise snap-start"
              style={{ animationDelay: `${120 + i * 50}ms` }}
            >
              <Link
                to={resumeHref(book)}
                className="flex items-center gap-3 rounded-2xl border bg-card p-2.5 transition-[transform,background-color] duration-300 hover:bg-accent active:scale-[0.98]"
              >
                <BookCover
                  title=""
                  coverUrl={book.coverUrl}
                  progress={book.lastRead?.fraction}
                  className="w-11 shrink-0 rounded-md shadow-none"
                />
                <span className="min-w-0">
                  <span className="line-clamp-2 font-medium text-sm leading-snug">
                    {book.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-muted-foreground text-xs">
                    {book.lastRead?.kind === 'audio' && <HeadphonesIcon className="size-3" />}
                    {progressLabel(book, book.lastRead?.fraction ?? 0)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** How far into a Book, as a ring that fills on arrival. */
function ProgressRing({ fraction, label }: { fraction: number; label?: string | undefined }) {
  const r = 19
  const length = 2 * Math.PI * r
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(fraction))
    return () => cancelAnimationFrame(id)
  }, [fraction])
  const percent = `${Math.round(fraction * 100)}%`
  return (
    <span className="flex items-center gap-2">
      <span role="img" aria-label={`${percent} read`} className="relative size-11">
        <svg viewBox="0 0 44 44" className="size-11 -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r={r} fill="none" strokeWidth="3" className="stroke-white/10" />
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - drawn)}
            className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-out-soft"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-semibold text-[0.6875rem] tabular-nums">
          {percent}
        </span>
      </span>
      {label && <span className="text-muted-foreground text-xs">{label}</span>}
    </span>
  )
}

/** Typing updates the URL after a short pause, not on every key. */
function SearchBox({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (q: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  // The top bar's search button, pressed on another page, lands here with the field focused.
  const { state } = useLocation()
  useEffect(() => {
    if ((state as { focusSearch?: boolean } | null)?.focusSearch)
      document.getElementById(LIBRARY_SEARCH_ID)?.focus()
  }, [state])
  const latest = useRef(value)
  useEffect(() => {
    if (value !== latest.current) setDraft(value)
    latest.current = value
  }, [value])
  useEffect(() => {
    if (draft === latest.current) return
    const timer = setTimeout(() => {
      latest.current = draft
      onChange(draft)
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, onChange])
  return (
    <InputGroup className={cn('w-full rounded-full before:rounded-full', className)}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        id={LIBRARY_SEARCH_ID}
        type="search"
        placeholder="Search title, author, series, tag…"
        aria-label="Search the library"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </InputGroup>
  )
}
