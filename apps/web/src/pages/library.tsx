import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useUploads } from '@/components/uploads'
import { type BookSummary, useBooks } from '@/lib/books'

export function LibraryPage() {
  const books = useBooks()
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
  if (books.isError) return <p className="text-destructive">Couldn't load your library.</p>

  if (books.data.books.length === 0)
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-semibold text-xl">Library</h1>
        {picker}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6">
        {books.data.books.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </ul>
    </div>
  )
}

function BookCard({ book }: { book: BookSummary }) {
  return (
    <li className="flex flex-col gap-2">
      <div className="aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center p-3 text-center font-medium text-muted-foreground text-sm">
            {book.title}
          </div>
        )}
      </div>
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
      </div>
    </li>
  )
}
