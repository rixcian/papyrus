import { XIcon } from 'lucide-react'
import { useState } from 'react'
import { type BookSummary, useDeleteBooks, useSetHidden } from '@/lib/books'
import { ConfirmDialog } from './confirm-dialog'
import { ShareDialog } from './share-dialog'
import { ShelvesMenu } from './shelves-menu'
import { Button } from './ui/button'

const plural = (n: number) => `${n} ${n === 1 ? 'Book' : 'Books'}`

/**
 * Bulk actions for a multi-select (ticket 10). Each acts only on the Books it is allowed
 * for: Share and Delete on the Profile's own, Hide on Books Shared with it.
 */
export function SelectionBar({
  books,
  hiddenView,
  onClear,
}: {
  books: BookSummary[]
  /** Listing hidden Books, so Hide becomes Unhide. */
  hiddenView: boolean
  onClear: () => void
}) {
  const own = books.filter((b) => b.owned).map((b) => b.id)
  const shared = books.filter((b) => !b.owned).map((b) => b.id)
  const setHidden = useSetHidden()
  const deleteBooks = useDeleteBooks()
  const [sharing, setSharing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <div
      role="toolbar"
      aria-label="Selected Books"
      className="fixed inset-x-0 bottom-4 z-45 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-1.5 rounded-2xl border bg-popover p-2 shadow-lg"
    >
      <span className="px-2 font-medium text-sm">{books.length} selected</span>
      <ShelvesMenu
        bookIds={books.map((b) => b.id)}
        onDone={onClear}
        trigger={
          <Button size="sm" variant="outline">
            Add to shelf
          </Button>
        }
      />
      {own.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => setSharing(true)}>
          Share{shared.length > 0 && ` ${own.length}`}
        </Button>
      )}
      {shared.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={setHidden.isPending}
          onClick={() =>
            setHidden.mutate({ bookIds: shared, hidden: !hiddenView }, { onSuccess: onClear })
          }
        >
          {hiddenView ? 'Unhide' : 'Hide'}
          {own.length > 0 && ` ${shared.length}`}
        </Button>
      )}
      {own.length > 0 && (
        <Button size="sm" variant="destructive-outline" onClick={() => setDeleting(true)}>
          Delete{shared.length > 0 && ` ${own.length}`}
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={onClear}>
        <XIcon />
      </Button>

      {sharing && (
        <ShareDialog
          bookIds={own}
          title={`Share ${plural(own.length)}`}
          share={{ mode: 'none', profiles: [] }}
          open={sharing}
          onOpenChange={setSharing}
          onSaved={onClear}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${plural(own.length)}?`}
        description="They disappear for everyone they are Shared with, along with all reading progress and highlights on them. This can't be undone."
        confirmLabel={`Delete ${plural(own.length)}`}
        onConfirm={async () => {
          await deleteBooks.mutateAsync(own)
          onClear()
        }}
      />
    </div>
  )
}
