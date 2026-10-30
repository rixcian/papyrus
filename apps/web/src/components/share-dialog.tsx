import { type FormEvent, useState } from 'react'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { type ShareMode, type ShareState, useShareBook } from '@/lib/books'
import { useProfiles, useSession } from '@/lib/session'

/** How the current Share reads on Book detail, for the Owning Profile only. */
export function describeShare(share: ShareState): string {
  if (share.mode === 'everyone') return 'Shared with everyone'
  if (share.mode === 'named') return `Shared with ${share.profiles.map((p) => p.name).join(', ')}`
  return 'Not shared'
}

/** Not shared, everyone (including Profiles added later), or named Profiles (ticket 06). */
export function ShareDialog({
  bookId,
  title,
  share,
  open,
  onOpenChange,
}: {
  bookId: string
  title: string
  share: ShareState
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: me } = useSession()
  const profiles = useProfiles({ fresh: true })
  const others = (profiles.data ?? []).filter((p) => p.id !== me?.id)
  const [mode, setMode] = useState<ShareMode>(share.mode)
  const [named, setNamed] = useState(() => new Set(share.profiles.map((p) => p.id)))
  const [error, setError] = useState<string | null>(null)
  const save = useShareBook(bookId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await save.mutateAsync({ mode, profileIds: mode === 'named' ? [...named] : [] })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t save the Share')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Share {title}</DialogTitle>
            <DialogDescription>
              Profiles you Share with can read and download it. They can’t change or delete it.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as ShareMode)}>
              <Label>
                <Radio value="none" /> Not shared
              </Label>
              <Label>
                <Radio value="everyone" /> Everyone, including Profiles added later
              </Label>
              <Label>
                <Radio value="named" disabled={profiles.isSuccess && others.length === 0} /> Only
                these Profiles
              </Label>
            </RadioGroup>
            {mode === 'named' && (
              <fieldset className="flex flex-col gap-2 ps-6">
                <legend className="sr-only">Profiles to Share with</legend>
                {others.map((p) => (
                  <Label key={p.id}>
                    <Checkbox
                      checked={named.has(p.id)}
                      onCheckedChange={(checked) =>
                        setNamed((prev) => {
                          const next = new Set(prev)
                          if (checked) next.add(p.id)
                          else next.delete(p.id)
                          return next
                        })
                      }
                    />
                    {p.name}
                  </Label>
                ))}
              </fieldset>
            )}
            {others.length === 0 && (
              <p className="text-muted-foreground text-sm">
                There are no other Profiles yet. Sharing with everyone includes Profiles added
                later.
              </p>
            )}
            {error && <p className="text-destructive-foreground text-sm">{error}</p>}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
