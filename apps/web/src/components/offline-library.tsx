import { Link } from 'react-router'
import { useOfflineBooks } from '@/lib/offline'
import { BookCover } from './book-cover'

/** The library with no connection: the Books this Profile saved on this device (ticket 05). */
export function OfflineLibrary({ profileId }: { profileId: string }) {
  const books = useOfflineBooks(profileId)
  return (
    <section>
      <h1 className="font-semibold text-xl">Library</h1>
      <p className="mt-1 mb-6 text-muted-foreground text-sm">
        You're offline. These are the Books saved on this device.
      </p>
      {books.data?.length === 0 && (
        <p className="py-12 text-center text-muted-foreground text-sm">
          No Books are saved on this device. Use “Make available offline” on a Book while you're
          online.
        </p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6">
        {books.data?.map((book) => (
          <li key={book.bookId}>
            <Link to={`/books/${book.bookId}`} className="flex flex-col gap-2">
              <BookCover title={book.title} coverUrl={book.coverUrl} />
              <div className="min-w-0">
                <div className="line-clamp-2 font-medium text-sm leading-snug">{book.title}</div>
                <div className="truncate text-muted-foreground text-xs">
                  {book.authors.join(', ')}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
