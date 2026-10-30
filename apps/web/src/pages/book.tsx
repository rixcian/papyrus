import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BookCover } from '@/components/book-cover'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EditBookDialog } from '@/components/edit-book-dialog'
import { describeShare, ShareDialog } from '@/components/share-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  type BookDetail,
  type BookFile,
  formatSize,
  useBook,
  useDeleteBook,
  useDeleteFile,
  useSetHidden,
  useSetReadStatus,
} from '@/lib/books'
import { useSession } from '@/lib/session'
import type { ReadStatus } from '@/sync'

export function BookPage() {
  const { bookId = '' } = useParams()
  const book = useBook(bookId)

  if (book.isPending) return null
  if (book.isError)
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground">This Book doesn't exist or isn't Shared with you.</p>
        <Link to="/" className="mt-2 inline-block underline">
          Back to the library
        </Link>
      </div>
    )
  return <BookView book={book.data} />
}

function BookView({ book }: { book: BookDetail }) {
  const navigate = useNavigate()
  const deleteBook = useDeleteBook()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const setHidden = useSetHidden(book.id)

  const lastRead =
    book.lastRead && book.files.find((f) => f.id === book.lastRead?.fileId && f.readable)
  const readable = lastRead || preferredReadable(book.files)
  const details = [
    ['Publisher', book.publisher],
    ['Published', book.publishedDate],
    ['Language', book.language],
    ['ISBN', book.isbn],
  ].filter((d): d is [string, string] => Boolean(d[1]))

  return (
    <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
      <BookCover title={book.title} coverUrl={book.coverUrl} className="mx-auto w-44 md:w-full" />
      <div className="min-w-0">
        <h1 className="font-semibold text-2xl tracking-tight">{book.title}</h1>
        {book.authors.length > 0 && (
          <p className="mt-1 text-lg text-muted-foreground">{book.authors.join(', ')}</p>
        )}
        {book.seriesName && (
          <p className="mt-1 text-muted-foreground text-sm">
            {book.seriesName}
            {book.seriesIndex != null && ` #${book.seriesIndex}`}
          </p>
        )}
        {!book.owned && (
          <p className="mt-1 text-muted-foreground text-sm">
            Shared by {book.sharedBy}
            {book.hidden && ' · Hidden from your library'}
          </p>
        )}
        {book.share && (
          <p className="mt-1 text-muted-foreground text-sm">{describeShare(book.share)}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {readable && (
            <Button render={<Link to={`/read/${readable.id}`} />}>
              {lastRead && book.lastRead
                ? `Continue · ${Math.round(book.lastRead.fraction * 100)}%`
                : 'Read'}
            </Button>
          )}
          <Button
            variant="outline"
            render={<a href={`/api/books/${book.id}/highlights.md`} download />}
          >
            Export highlights
          </Button>
          {book.owned && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit metadata
              </Button>
              <Button variant="outline" onClick={() => setSharing(true)}>
                Share
              </Button>
              <Button variant="destructive-outline" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </>
          )}
          {!book.owned && (
            <Button
              variant="outline"
              disabled={setHidden.isPending}
              onClick={() => setHidden.mutate(!book.hidden)}
            >
              {book.hidden ? 'Unhide' : 'Hide from my library'}
            </Button>
          )}
        </div>

        <ReadStatusControl bookId={book.id} status={book.readStatus} />

        {book.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {book.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {book.description && (
          <p className="mt-6 max-w-prose whitespace-pre-line leading-relaxed">{book.description}</p>
        )}

        {details.length > 0 && (
          <dl className="mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {details.map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-muted-foreground">{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <h2 className="mt-8 mb-2 font-semibold">Files</h2>
        <ul className="divide-y rounded-xl border">
          {book.files.map((file) => (
            <FileRow key={file.id} file={file} canRemove={book.owned && book.files.length > 1} />
          ))}
        </ul>
      </div>

      {sharing && book.share && (
        <ShareDialog
          bookId={book.id}
          title={book.title}
          share={book.share}
          open={sharing}
          onOpenChange={setSharing}
        />
      )}
      {editing && <EditBookDialog book={book} open={editing} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${book.title}?`}
        description="It disappears for everyone it is Shared with, along with all reading progress and highlights on it. This can't be undone."
        confirmLabel="Delete Book"
        onConfirm={async () => {
          await deleteBook.mutateAsync(book.id)
          navigate('/', { replace: true })
        }}
      />
    </div>
  )
}

const STATUS_LABELS: Record<ReadStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  finished: 'Finished',
}

function ReadStatusControl({ bookId, status }: { bookId: string; status: ReadStatus }) {
  const { data: profile } = useSession()
  const setStatus = useSetReadStatus(profile?.id ?? '')
  return (
    <fieldset className="mt-4 flex items-center gap-1.5">
      <legend className="sr-only">Read status</legend>
      {(Object.keys(STATUS_LABELS) as ReadStatus[]).map((s) => (
        <Button
          key={s}
          size="xs"
          variant={s === status ? 'secondary' : 'ghost'}
          aria-pressed={s === status}
          onClick={() => s !== status && setStatus.mutate({ bookId, status: s })}
        >
          {STATUS_LABELS[s]}
        </Button>
      ))}
    </fieldset>
  )
}

const READ_PREFERENCE = ['epub', 'azw3', 'mobi']

/** Slice 10 makes this the File read most recently; until then epub before azw3 before mobi. */
function preferredReadable(files: BookFile[]): BookFile | undefined {
  return files
    .filter((f) => f.readable)
    .sort((a, b) => READ_PREFERENCE.indexOf(a.format) - READ_PREFERENCE.indexOf(b.format))[0]
}

function FileRow({ file, canRemove }: { file: BookFile; canRemove: boolean }) {
  const deleteFile = useDeleteFile()
  const [removing, setRemoving] = useState(false)

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
      <Badge variant="outline" className="uppercase">
        {file.format}
      </Badge>
      <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
      <span className="text-muted-foreground tabular-nums">{formatSize(file.size)}</span>
      {file.readable && (
        <Button variant="ghost" size="sm" render={<Link to={`/read/${file.id}`} />}>
          Read
        </Button>
      )}
      <Button variant="ghost" size="sm" render={<a href={`${file.url}?download=1`} download />}>
        Download
      </Button>
      {canRemove && (
        <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}>
          Remove
        </Button>
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${file.originalName}?`}
        description="Reading progress and highlights on this File will be lost for everyone it's Shared with."
        confirmLabel="Remove File"
        onConfirm={() => deleteFile.mutateAsync(file.id)}
      />
    </li>
  )
}
