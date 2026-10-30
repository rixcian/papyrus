import { LayoutGridIcon, ListIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BookCover } from '@/components/book-cover'
import {
  BookViews,
  type LibraryLayout,
  type Selection,
  SelectionContext,
} from '@/components/book-views'
import { LibraryFilters } from '@/components/library-filters'
import { OfflineLibrary } from '@/components/offline-library'
import { SelectionBar } from '@/components/selection-bar'
import { Badge } from '@/components/ui/badge'
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
import { useShelves } from '@/lib/shelves'
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
  const wide = useMediaQuery('lg')
  const list = useBookList(query)
  const continuing = useContinueReading()
  const { data: profile } = useSession()
  const hiddenCount = useFacets().data?.hidden ?? 0
  const shelves = useShelves()
  const shelfName = shelves.data?.find((s) => s.id === query.shelf)?.name
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
      <Button onClick={() => input.current?.click()}>Upload</Button>
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
        <div className="flex flex-col items-center gap-4">
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

  const filters = (
    <LibraryFilters
      query={query}
      onChange={(patch) => {
        update(patch)
        setFiltersOpen(false)
      }}
    />
  )
  const chips = (
    [
      ['scope', query.scope && SCOPE_LABELS[query.scope]],
      ['hidden', query.hidden && 'Hidden'],
      ['status', query.status && STATUS_LABELS[query.status]],
      ['author', query.author],
      ['series', query.series],
      ['tag', query.tag],
      ['shelf', query.shelf && (shelfName ?? 'Shelf')],
    ] as const
  ).filter(([, label]) => label)
  const sort = query.sort ?? (query.q ? 'relevance' : query.series ? 'series' : 'added')

  return (
    <div className="flex flex-col gap-8">
      {!filtered && continuing.data && continuing.data.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Continue reading</h2>
          <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
            {continuing.data.map((book) => (
              <li key={book.id} className="w-28 shrink-0">
                <Link to={`/read/${book.lastRead?.fileId}`} className="flex flex-col gap-1.5">
                  <BookCover
                    title={book.title}
                    coverUrl={book.coverUrl}
                    progress={book.lastRead?.fraction}
                  />
                  <span className="line-clamp-2 text-xs leading-snug">{book.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {wide && (
          <aside className="sticky top-20 max-h-[calc(100dvh-6rem)] self-start overflow-y-auto">
            {filters}
          </aside>
        )}

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="font-semibold text-xl">Library</h1>
            {picker}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchBox value={query.q ?? ''} onChange={search} />
            {!wide && (
              <Button variant="outline" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontalIcon />
                Filters
                {chips.length > 0 && <Badge variant="secondary">{chips.length}</Badge>}
              </Button>
            )}
            <Select
              items={SORTS.filter((s) => s.value !== 'relevance' || query.q)}
              value={sort}
              onValueChange={(value) => update({ sort: value as BookSort })}
            >
              <SelectTrigger className="w-auto min-w-36" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {SORTS.filter((s) => s.value !== 'relevance' || query.q).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            <span>
              {total} {total === 1 ? 'Book' : 'Books'}
            </span>
            {chips.map(([key, label]) => (
              <Badge key={key} variant="outline" className="gap-1">
                {label}
                <button
                  type="button"
                  aria-label={`Clear ${key} filter`}
                  onClick={() => update({ [key]: undefined })}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
            <ToggleGroup
              variant="outline"
              size="sm"
              className="ms-auto"
              value={[layout]}
              onValueChange={(value) => value[0] && setLayout(value[0] as LibraryLayout)}
            >
              <ToggleGroupItem value="grid" aria-label="Grid">
                <LayoutGridIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List">
                <ListIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

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
      </div>

      {selected.size > 0 && (
        <SelectionBar
          books={[...selected.values()]}
          hiddenView={query.hidden === 'true'}
          onClear={clearSelection}
        />
      )}

      {!wide && (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetPopup side="left">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <SheetPanel>{filters}</SheetPanel>
          </SheetPopup>
        </Sheet>
      )}
    </div>
  )
}

/** Typing updates the URL after a short pause, not on every key. */
function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [draft, setDraft] = useState(value)
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
    <InputGroup className="w-full sm:w-64">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        placeholder="Search title, author, series, tag…"
        aria-label="Search the library"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </InputGroup>
  )
}
