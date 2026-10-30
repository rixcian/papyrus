import { HeadphonesIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { formatSize } from '@/lib/books'
import { offlineSupported, useOfflineBooks, useRemoveOffline, useStorageInfo } from '@/lib/offline'
import { APP_VERSION, platform, useInstallPrompt, usePwa } from '@/lib/pwa'
import { ConfirmDialog } from './confirm-dialog'
import { Button } from './ui/button'

/** Settings → This device: Offline Books, storage, install and version (ticket 05). */
export function ThisDevice({ profileId }: { profileId: string }) {
  const books = useOfflineBooks(profileId)
  const remove = useRemoveOffline(profileId)
  const storage = useStorageInfo()
  const [clearing, setClearing] = useState(false)
  const total = books.data?.reduce((sum, b) => sum + b.bytes, 0) ?? 0

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-semibold text-xl">This device</h2>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-medium">Offline Books</h3>
          {books.data && books.data.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setClearing(true)}>
              Remove all offline
            </Button>
          )}
        </div>
        {!offlineSupported ? (
          <p className="text-muted-foreground text-sm">
            Offline Books need a secure connection. Open Papyrus over HTTPS (or on localhost) to
            keep Books on this device.
          </p>
        ) : books.data?.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            None yet. Open a Book and choose “Make available offline” to read it without a
            connection.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {books.data?.map((book) => (
              <li key={book.bookId} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Link
                  to={`/books/${book.bookId}`}
                  className="flex min-w-0 flex-1 items-center gap-1.5"
                >
                  <span className="truncate">{book.title}</span>
                  {book.files.some((f) => f.audio) && (
                    <HeadphonesIcon
                      role="img"
                      aria-label="Audiobook"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                  )}
                </Link>
                <span className="text-muted-foreground tabular-nums">{formatSize(book.bytes)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate([book.bookId])}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {total > 0 && (
          <p className="mt-2 text-muted-foreground text-sm">
            {formatSize(total)} of Offline Books for this Profile.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Storage used</dt>
        <dd>
          {storage.data?.usage != null
            ? `${formatSize(storage.data.usage)}${storage.data.quota ? ` of ${formatSize(storage.data.quota)} available` : ''}`
            : 'Unknown'}
        </dd>
        <dt className="text-muted-foreground">Kept by the browser</dt>
        <dd>
          {storage.data?.persisted
            ? 'Yes, it won’t be cleared to free space'
            : 'Not guaranteed; the browser may clear it when space runs low'}
        </dd>
        <dt className="text-muted-foreground">Version</dt>
        <dd>{APP_VERSION}</dd>
      </dl>

      <UpdateRow />
      <Install />

      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Remove all Offline Books?"
        description="They stay in your library; you'll need a connection to read them again."
        confirmLabel="Remove all"
        onConfirm={() => remove.mutateAsync('all')}
      />
    </section>
  )
}

function UpdateRow() {
  const { needRefresh, update } = usePwa()
  if (!needRefresh) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
      <span>Update available</span>
      <Button size="sm" onClick={update}>
        Reload
      </Button>
    </div>
  )
}

const INSTRUCTIONS: Record<Exclude<ReturnType<typeof platform>, 'installed'>, string> = {
  ios: 'In Safari, tap Share, then “Add to Home Screen”. Installed, iOS keeps your Offline Books; in a browser tab, Safari clears them after 7 days without a visit.',
  'macos-safari': 'In Safari, choose File → Add to Dock.',
  firefox:
    'Firefox on the desktop can’t install web apps. Use Chrome, Edge or Safari, or keep Papyrus open in a tab.',
  other: 'Use your browser’s menu and choose “Install app” or “Add to Home Screen”.',
}

function Install() {
  const prompt = useInstallPrompt()
  const where = platform()
  return (
    <div>
      <h3 className="mb-1 font-medium">Install</h3>
      {where === 'installed' ? (
        <p className="text-muted-foreground text-sm">Papyrus is installed on this device.</p>
      ) : prompt ? (
        <Button size="sm" onClick={() => void prompt()}>
          Install Papyrus
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">{INSTRUCTIONS[where]}</p>
      )}
    </div>
  )
}
