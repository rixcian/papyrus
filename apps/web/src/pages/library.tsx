import { useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BookCover } from '@/components/book-cover'
import { Button } from '@/components/ui/button'
import { useUploads } from '@/components/uploads'
import { type BookSummary, useBooks } from '@/lib/books'
import type { ReadStatus } from '@/sync'

const FILTERS: { value: ReadStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
]

const isStatus = (v: string | null): v is ReadStatus =>
  v === 'unread' || v === 'reading' || v === 'finished'

export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('status')
  const status = isStatus(raw) ? raw : undefined
  const books = useBooks(status)
  const { addFiles } = useUploads()
  const input = useRef<HTMLInputElement>(null)

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

  if (books.isPending) return null
  if (books.isError)
    return <p className="text-destructive-foreground">Couldn't load your library.</p>

  if (books.data.books.length === 0 && !status)
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
        </div>
      </div>
    )

  // Books being read, most recently read first (ticket 10).
  const continuing = status
    ? []
    : books.data.books
        .filter((b) => b.readStatus === 'reading' && b.lastRead)
        .sort((a, b) => (b.lastRead?.at ?? 0) - (a.lastRead?.at ?? 0))
        .slice(0, 12)

  return (
    <div className="flex flex-col gap-8">
      {continuing.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Continue reading</h2>
          <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
            {continuing.map((book) => (
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

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-semibold text-xl">Library</h1>
          <fieldset className="flex gap-1">
            <legend className="sr-only">Filter by read status</legend>
            {FILTERS.map((f) => (
              <Button
                key={f.label}
                size="xs"
                variant={f.value === status ? 'secondary' : 'ghost'}
                aria-pressed={f.value === status}
                onClick={() => setParams(f.value ? { status: f.value } : {})}
              >
                {f.label}
              </Button>
            ))}
          </fieldset>
          <div className="flex-1" />
          {picker}
        </div>
        {books.data.books.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground text-sm">No Books here.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6">
            {books.data.books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function BookCard({ book }: { book: BookSummary }) {
  return (
    <li>
      <Link to={`/books/${book.id}`} className="flex flex-col gap-2 rounded-lg outline-offset-4">
        <BookCover
          title={book.title}
          coverUrl={book.coverUrl}
          progress={book.readStatus === 'reading' ? book.lastRead?.fraction : undefined}
        />
        <div className="min-w-0">
          <div className="line-clamp-2 font-medium text-sm leading-snug">{book.title}</div>
          {book.authors.length > 0 && (
            <div className="truncate text-muted-foreground text-xs">{book.authors.join(', ')}</div>
          )}
          {book.seriesName && (
            <div className="truncate text-muted-foreground text-xs">
              {book.seriesName}
              {book.seriesIndex != null && ` #${book.seriesIndex}`}
            </div>
          )}
          {book.readStatus === 'finished' && (
            <div className="text-muted-foreground text-xs">Finished</div>
          )}
        </div>
      </Link>
    </li>
  )
}
