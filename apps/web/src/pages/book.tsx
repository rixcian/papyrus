import {
  BookOpenIcon,
  CloudCheckIcon,
  CloudDownloadIcon,
  EllipsisIcon,
  HeadphonesIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BookCover } from '@/components/book-cover'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EditBookDialog } from '@/components/edit-book-dialog'
import { MergeDialog } from '@/components/merge-dialog'
import { describeShare, ShareDialog } from '@/components/share-dialog'
import { ShelvesMenu } from '@/components/shelves-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu'
import {
  type BookDetail,
  type BookFile,
  formatSize,
  useBook,
  useDeleteBooks,
  useDeleteFile,
  useSetHidden,
  useSetReadStatus,
  useSplitFile,
} from '@/lib/books'
import {
  isUnreachable,
  offlineSupported,
  useOfflineBooks,
  useRemoveOffline,
  useSaveOffline,
} from '@/lib/offline'
import { useSession } from '@/lib/session'
import type { OfflineBook } from '@/offline/store'
import { formatLength } from '@/player/timeline'
import type { ReadStatus } from '@/sync'

export function BookPage() {
  const { bookId = '' } = useParams()
  const book = useBook(bookId)
  const { data: profile } = useSession()
  const offline = useOfflineBooks(profile?.id)
  const saved = offline.data?.find((b) => b.bookId === bookId)

  if (book.isPending) return null
  if (book.isError && saved && isUnreachable(book.error)) return <OfflineBookView book={saved} />
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
  const deleteBook = useDeleteBooks()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [merging, setMerging] = useState(false)
  const setHidden = useSetHidden()

  const lastRead =
    book.lastRead && book.files.find((f) => f.id === book.lastRead?.fileId && f.readable)
  const readable = lastRead || preferredReadable(book.files)
  const lastListened =
    book.lastRead && book.files.find((f) => f.id === book.lastRead?.fileId && f.kind === 'audio')
  const listenable = lastListened || book.files.find((f) => f.kind === 'audio')
  const timeLeft =
    lastListened?.duration && book.lastRead
      ? formatLength((1 - book.lastRead.fraction) * lastListened.duration)
      : null
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
            <Button
              variant={listenable && lastListened ? 'outline' : 'default'}
              render={<Link to={`/read/${readable.id}`} />}
            >
              <BookOpenIcon />
              {lastRead && book.lastRead
                ? `Continue · ${Math.round(book.lastRead.fraction * 100)}%`
                : 'Read'}
            </Button>
          )}
          {listenable && (
            <Button
              variant={readable && !lastListened ? 'outline' : 'default'}
              render={<Link to={`/listen/${listenable.id}`} />}
            >
              <HeadphonesIcon />
              {timeLeft ? `Listen · ${timeLeft} left` : 'Listen'}
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
              <Menu>
                <MenuTrigger
                  render={<Button variant="outline" size="icon" aria-label="More actions" />}
                >
                  <EllipsisIcon />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem onClick={() => setMerging(true)}>Merge into…</MenuItem>
                  <MenuItem variant="destructive" onClick={() => setDeleting(true)}>
                    Delete
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </>
          )}
          <OfflineToggle book={book} />
          <ShelvesMenu
            bookIds={[book.id]}
            onShelves={book.shelves.map((s) => s.id)}
            trigger={<Button variant="outline">Shelves</Button>}
          />
          {!book.owned && (
            <Button
              variant="outline"
              disabled={setHidden.isPending}
              onClick={() => setHidden.mutate({ bookIds: [book.id], hidden: !book.hidden })}
            >
              {book.hidden ? 'Unhide' : 'Hide from my library'}
            </Button>
          )}
        </div>

        <ReadStatusControl bookId={book.id} status={book.readStatus} />

        {book.shelves.length > 0 && (
          <p className="mt-3 text-muted-foreground text-sm">
            On{' '}
            {book.shelves.map((shelf, i) => (
              <span key={shelf.id}>
                {i > 0 && ', '}
                <Link to={`/?shelf=${shelf.id}`} className="underline underline-offset-2">
                  {shelf.name}
                </Link>
              </span>
            ))}
          </p>
        )}

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
            <FileRow key={file.id} file={file} canReshape={book.owned && book.files.length > 1} />
          ))}
        </ul>
      </div>

      {sharing && book.share && (
        <ShareDialog
          bookIds={[book.id]}
          title={`Share ${book.title}`}
          share={book.share}
          open={sharing}
          onOpenChange={setSharing}
        />
      )}
      {merging && <MergeDialog book={book} open={merging} onOpenChange={setMerging} />}
      {editing && <EditBookDialog book={book} open={editing} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${book.title}?`}
        description="It disappears for everyone it is Shared with, along with all reading progress and highlights on it. This can't be undone."
        confirmLabel="Delete Book"
        onConfirm={async () => {
          await deleteBook.mutateAsync([book.id])
          navigate('/', { replace: true })
        }}
      />
    </div>
  )
}

/** Keeps the Book's readable Files on this device (ticket 05). */
function OfflineToggle({ book }: { book: BookDetail }) {
  const { data: profile } = useSession()
  const profileId = profile?.id ?? ''
  const offline = useOfflineBooks(profileId)
  const save = useSaveOffline(profileId)
  const remove = useRemoveOffline(profileId)
  if (!offlineSupported || !book.files.some((f) => f.readable) || !offline.data) return null
  const saved = offline.data.some((b) => b.bookId === book.id)
  if (save.isPending)
    return (
      <Button variant="outline" disabled>
        Saving for offline…
      </Button>
    )
  return (
    <>
      <Button
        variant="outline"
        aria-pressed={saved}
        disabled={remove.isPending}
        onClick={() => (saved ? remove.mutate([book.id]) : save.mutate([book.id]))}
      >
        {saved ? <CloudCheckIcon /> : <CloudDownloadIcon />}
        {saved ? 'Available offline' : 'Make available offline'}
      </Button>
      {save.isError && (
        <p className="w-full text-destructive-foreground text-sm">{save.error.message}</p>
      )}
    </>
  )
}

/** Book detail with no connection: what this device saved is enough to read. */
function OfflineBookView({ book }: { book: OfflineBook }) {
  return (
    <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
      <BookCover title={book.title} coverUrl={book.coverUrl} className="mx-auto w-44 md:w-full" />
      <div className="min-w-0">
        <h1 className="font-semibold text-2xl tracking-tight">{book.title}</h1>
        {book.authors.length > 0 && (
          <p className="mt-1 text-lg text-muted-foreground">{book.authors.join(', ')}</p>
        )}
        <p className="mt-3 text-muted-foreground text-sm">
          You're offline. This Book is saved on this device.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {book.files.map((file) => (
            <Button key={file.id} render={<Link to={`/read/${file.id}`} />}>
              Read {book.files.length > 1 && file.format.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>
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

/** `canReshape`: the owner may remove or split off this File, as it isn't the only one. */
function FileRow({ file, canReshape }: { file: BookFile; canReshape: boolean }) {
  const deleteFile = useDeleteFile()
  const splitFile = useSplitFile()
  const navigate = useNavigate()
  const [removing, setRemoving] = useState(false)
  const [splitting, setSplitting] = useState(false)

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
      {canReshape && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setSplitting(true)}>
            Split
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}>
            Remove
          </Button>
        </>
      )}
      <ConfirmDialog
        open={splitting}
        onOpenChange={setSplitting}
        title={`Split ${file.originalName} into a new Book?`}
        description="It becomes a Book of its own, with the details read from the File. Reading progress, highlights, shelves and Shares come along."
        confirmLabel="Split into new Book"
        destructive={false}
        onConfirm={async () => {
          const created = await splitFile.mutateAsync(file.id)
          navigate(`/books/${created.id}`)
        }}
      />
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
