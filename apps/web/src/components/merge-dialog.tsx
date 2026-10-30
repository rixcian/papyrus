import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '@/api/client'
import { BookCover } from '@/components/book-cover'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { type BookDetail, useBookList, useMergeBook } from '@/lib/books'
import { cn } from '@/lib/utils'

/** Picks another of the Profile's own Books to merge this one into (ticket 09). */
export function MergeDialog({
  book,
  open,
  onOpenChange,
}: {
  book: BookDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const merge = useMergeBook()
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [targetId, setTargetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setQ(draft.trim()), 250)
    return () => clearTimeout(timer)
  }, [draft])
  const list = useBookList({ scope: 'mine', sort: 'title', ...(q && { q }) })
  const candidates = (list.data?.pages.flatMap((p) => p.books) ?? []).filter(
    (b) => b.id !== book.id,
  )
  const target = candidates.find((b) => b.id === targetId)

  const submit = async () => {
    if (!targetId) return
    setError(null)
    try {
      await merge.mutateAsync({ bookId: book.id, targetId })
      onOpenChange(false)
      navigate(`/books/${targetId}`, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t merge the Books')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge “{book.title}” into…</DialogTitle>
          <DialogDescription>
            Its Files move into the Book you pick, with everyone’s reading progress and highlights.
            That Book keeps its own details, and “{book.title}” is deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          <Input
            type="search"
            aria-label="Find a Book"
            placeholder="Find one of your Books"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <ul className="flex max-h-72 flex-col overflow-y-auto" aria-label="Your Books">
            {candidates.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  aria-pressed={b.id === targetId}
                  onClick={() => setTargetId(b.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start hover:bg-accent',
                    b.id === targetId && 'bg-accent',
                  )}
                >
                  <BookCover title="" coverUrl={b.coverUrl} className="w-8 shrink-0 rounded-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-sm">{b.title}</span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {[b.authors.join(', '), b.formats.join(', ').toUpperCase()]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {list.isSuccess && candidates.length === 0 && (
              <li className="px-2 py-4 text-center text-muted-foreground text-sm">
                No other Books of yours match.
              </li>
            )}
          </ul>
          {error && <p className="text-destructive-foreground text-sm">{error}</p>}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!target || merge.isPending} onClick={() => void submit()}>
            {target ? `Merge into “${target.title}”` : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
