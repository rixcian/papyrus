import {
  BookOpenIcon,
  CloudCheckIcon,
  CloudDownloadIcon,
  DownloadIcon,
  EllipsisIcon,
  HeadphonesIcon,
  LibraryBigIcon,
  PencilIcon,
  Share2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Ambient } from '@/components/ambient'
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
  offlineBytes,
  offlineSupported,
  useOfflineBooks,
  useRemoveOffline,
  useSaveOffline,
} from '@/lib/offline'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
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

  const percent = book.lastRead ? Math.round(book.lastRead.fraction * 100) : null
  const audioFile = book.files.find((f) => f.kind === 'audio')
  const stats = [
    percent !== null && book.readStatus !== 'finished' ? [`${percent}%`, 'Read'] : null,
    book.readStatus === 'finished' ? ['Done', 'Finished'] : null,
    [
      book.files
        .filter((f) => f.readable)
        .map((f) => f.format.toUpperCase())
        .filter((f, i, all) => all.indexOf(f) === i)
        .join(' · ') || '—',
      'Ebook',
    ],
    audioFile ? [audioFile.duration ? formatLength(audioFile.duration) : 'Yes', 'Audiobook'] : null,
  ].filter((s): s is [string, string] => Boolean(s))

  return (
    <div className="grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-12 md:pt-6">
      <Ambient coverUrl={book.coverUrl} className="h-[36rem]" />
      <BookCover
        title={book.title}
        coverUrl={book.coverUrl}
        className="mx-auto w-44 animate-cover-in self-start shadow-2xl shadow-black/60 md:w-full"
      />
      <div className="min-w-0 animate-rise [animation-delay:60ms]">
        <div className="text-center md:text-start">
          <h1 className="text-balance font-semibold text-3xl tracking-tight">{book.title}</h1>
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
        </div>

        <dl
          className="mt-6 grid divide-x rounded-2xl border bg-card/60 backdrop-blur"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map(([value, label]) => (
            <div key={label} className="flex flex-col-reverse items-center px-2 py-3 text-center">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="truncate font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {(readable || listenable) && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            {readable && (
              <Button
                size="lg"
                variant={listenable && lastListened ? 'secondary' : 'default'}
                className="h-12 rounded-full text-base sm:flex-1"
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
                size="lg"
                variant={readable && !lastListened ? 'secondary' : 'default'}
                className="h-12 rounded-full text-base sm:flex-1"
                render={<Link to={`/listen/${listenable.id}`} />}
              >
                <HeadphonesIcon />
                {timeLeft ? `Listen · ${timeLeft} left` : 'Listen'}
              </Button>
            )}
          </div>
        )}

        <ReadStatusControl bookId={book.id} status={book.readStatus} />

        <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start [&_button]:rounded-full [&_a]:rounded-full">
          <ShelvesMenu
            bookIds={[book.id]}
            onShelves={book.shelves.map((s) => s.id)}
            trigger={
              <Button variant="outline" size="sm">
                <LibraryBigIcon />
                Shelves
              </Button>
            }
          />
          {book.owned && (
            <>
              <Button variant="outline" size="sm" onClick={() => setSharing(true)}>
                <Share2Icon />
                Share
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilIcon />
                Edit metadata
              </Button>
            </>
          )}
          <OfflineToggle book={book} />
          {readable && (
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/api/books/${book.id}/highlights.md`} download />}
            >
              <DownloadIcon />
              Export highlights
            </Button>
          )}
          {!book.owned && (
            <Button
              variant="outline"
              size="sm"
              disabled={setHidden.isPending}
              onClick={() => setHidden.mutate({ bookIds: [book.id], hidden: !book.hidden })}
            >
              {book.hidden ? 'Unhide' : 'Hide from my library'}
            </Button>
          )}
          {book.owned && (
            <Menu>
              <MenuTrigger
                render={<Button variant="outline" size="icon-sm" aria-label="More actions" />}
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
          )}
        </div>

        {book.shelves.length > 0 && (
          <p className="mt-4 text-center text-muted-foreground text-sm md:text-start">
            On{' '}
            {book.shelves.map((shelf, i) => (
              <span key={shelf.id}>
                {i > 0 && ', '}
                <Link
                  to={`/?shelf=${shelf.id}`}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  {shelf.name}
                </Link>
              </span>
            ))}
          </p>
        )}

        {book.description && (
          <section className="mt-8">
            <h2 className="mb-2 font-semibold">About</h2>
            <Description text={book.description} />
          </section>
        )}

        {book.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {book.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="rounded-full">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {details.length > 0 && (
          <dl className="mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            {details.map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-muted-foreground">{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <h2 className="mt-8 mb-2 font-semibold">Files</h2>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card/60">
          {book.files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              canReshape={book.owned && book.files.length > 1}
              fraction={book.lastRead?.fileId === file.id ? book.lastRead.fraction : undefined}
            />
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
  const [confirming, setConfirming] = useState(false)
  if (
    !offlineSupported ||
    !book.files.some((f) => f.readable || f.kind === 'audio') ||
    !offline.data
  )
    return null
  const saved = offline.data.some((b) => b.bookId === book.id)
  const hasAudio = book.files.some((f) => f.kind === 'audio')
  if (save.isPending)
    return (
      <Button variant="outline" size="sm" disabled className="relative overflow-hidden">
        Saving for offline…
        {save.progress !== null && ` ${Math.round(save.progress * 100)}%`}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-[width]"
          style={{ width: `${(save.progress ?? 0) * 100}%` }}
        />
      </Button>
    )
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={saved}
        disabled={remove.isPending}
        onClick={() =>
          saved ? remove.mutate([book.id]) : hasAudio ? setConfirming(true) : save.mutate([book.id])
        }
      >
        {saved ? <CloudCheckIcon /> : <CloudDownloadIcon />}
        {saved ? 'Available offline' : 'Make available offline'}
      </Button>
      {save.isError && (
        <p className="w-full text-destructive-foreground text-sm">{save.error.message}</p>
      )}
      {/* Audiobooks are big; say how big before filling the device (spec: Offline). */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Save ${formatSize(offlineBytes(book))} on this device?`}
        description="The audiobook is downloaded in full so it plays with no connection. You can start listening while it saves."
        confirmLabel="Save offline"
        destructive={false}
        onConfirm={async () => {
          save.mutate([book.id])
        }}
      />
    </>
  )
}

/** Book detail with no connection: what this device saved is enough to read. */
function OfflineBookView({ book }: { book: OfflineBook }) {
  return (
    <div className="grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-12 md:pt-6">
      <Ambient coverUrl={book.coverUrl} className="h-[36rem]" />
      <BookCover
        title={book.title}
        coverUrl={book.coverUrl}
        className="mx-auto w-44 animate-cover-in self-start shadow-2xl shadow-black/60 md:w-full"
      />
      <div className="min-w-0 animate-rise text-center md:text-start">
        <h1 className="text-balance font-semibold text-3xl tracking-tight">{book.title}</h1>
        {book.authors.length > 0 && (
          <p className="mt-1 text-lg text-muted-foreground">{book.authors.join(', ')}</p>
        )}
        <p className="mt-3 text-muted-foreground text-sm">
          You're offline. This Book is saved on this device.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
          {book.files.map((file) => (
            <Button
              key={file.id}
              size="lg"
              className="rounded-full"
              render={<Link to={`/${file.audio ? 'listen' : 'read'}/${file.id}`} />}
            >
              {file.audio ? 'Listen' : 'Read'}{' '}
              {book.files.length > 1 && !file.audio && file.format.toUpperCase()}
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
  const statuses = Object.keys(STATUS_LABELS) as ReadStatus[]
  // Moves at once on a tap; the server's answer follows.
  const shown = setStatus.isPending ? (setStatus.variables?.status ?? status) : status
  return (
    <fieldset className="relative mt-4 grid grid-cols-3 rounded-full bg-muted p-1">
      <legend className="sr-only">Read status</legend>
      <span
        aria-hidden
        className="absolute inset-y-1 start-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-accent shadow-sm ring-1 ring-white/10 transition-transform duration-500 ease-spring"
        style={{ transform: `translateX(${statuses.indexOf(shown) * 100}%)` }}
      />
      {statuses.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === status}
          className="relative h-9 rounded-full font-medium text-muted-foreground text-sm transition-colors duration-300 aria-pressed:text-foreground"
          onClick={() => s !== status && setStatus.mutate({ bookId, status: s })}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
    </fieldset>
  )
}

/** A long description shows its first lines; More opens the rest. */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 360
  return (
    <div>
      <p
        className={cn(
          'max-w-prose whitespace-pre-line text-muted-foreground leading-relaxed',
          long && !open && 'line-clamp-5',
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="mt-1 font-medium text-sm hover:underline"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
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
function FileRow({
  file,
  canReshape,
  fraction,
}: {
  file: BookFile
  canReshape: boolean
  /** How far this Profile got, when this is the File it used last. */
  fraction?: number | undefined
}) {
  const deleteFile = useDeleteFile()
  const splitFile = useSplitFile()
  const navigate = useNavigate()
  const [removing, setRemoving] = useState(false)
  const [splitting, setSplitting] = useState(false)

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      <Badge variant="outline" className={file.kind === 'audio' ? undefined : 'uppercase'}>
        {file.kind === 'audio' ? 'Audiobook' : file.format}
      </Badge>
      {file.kind === 'audio' ? (
        <span className="min-w-0 flex-1 truncate">
          {[
            file.duration ? formatLength(file.duration) : null,
            file.trackCount > 1 ? `${file.trackCount} Tracks` : null,
            fraction !== undefined && file.duration
              ? `${formatLength((1 - fraction) * file.duration)} left`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
      )}
      <span className="text-muted-foreground tabular-nums">{formatSize(file.size)}</span>
      <div className="-me-1.5 flex w-full flex-wrap justify-end sm:w-auto">
        {file.kind === 'audio' && (
          <Button variant="ghost" size="sm" render={<Link to={`/listen/${file.id}`} />}>
            Listen
          </Button>
        )}
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
      </div>
      <ConfirmDialog
        open={splitting}
        onOpenChange={setSplitting}
        title={`Split ${file.kind === 'audio' ? 'the audiobook' : file.originalName} into a new Book?`}
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
        title={`Remove ${file.kind === 'audio' ? 'the audiobook' : file.originalName}?`}
        description="Reading progress and highlights on this File will be lost for everyone it's Shared with."
        confirmLabel="Remove File"
        onConfirm={() => deleteFile.mutateAsync(file.id)}
      />
    </li>
  )
}
