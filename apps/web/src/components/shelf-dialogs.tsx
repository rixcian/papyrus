import { type FormEvent, useState } from 'react'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/** Asks for a shelf name, for creating or renaming one. */
export function ShelfNameDialog({
  open,
  onOpenChange,
  title,
  initial = '',
  submitLabel,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial?: string
  submitLabel: string
  onSubmit: (name: string) => Promise<unknown>
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await onSubmit(name.trim())
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t save the shelf')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-sm">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-2">
            <Input
              aria-label="Shelf name"
              placeholder="Shelf name"
              value={name}
              maxLength={64}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            {error && <p className="text-destructive-foreground text-sm">{error}</p>}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
