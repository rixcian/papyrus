import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '@/api/client'
import { ProfileForm } from '@/components/profile-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useDeleteMyProfile, useSession, useUpdateMyProfile } from '@/lib/session'

export function SettingsPage() {
  const { data: profile } = useSession()
  const update = useUpdateMyProfile()
  const [saved, setSaved] = useState(false)
  if (!profile) return null

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-10">
      <section>
        <h1 className="mb-4 font-semibold text-xl">Profile</h1>
        <ProfileForm
          key={profile.id}
          initial={profile}
          submitLabel={saved ? 'Saved' : 'Save'}
          onSubmit={async (values) => {
            await update.mutateAsync(values)
            setSaved(true)
            setTimeout(() => setSaved(false), 1500)
          }}
        />
      </section>
      <DeleteProfile name={profile.name} />
    </div>
  )
}

function DeleteProfile({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteMyProfile()
  const navigate = useNavigate()
  const matches = typed.trim().toLocaleLowerCase() === name.toLocaleLowerCase()

  return (
    <section className="rounded-2xl border border-destructive/30 p-4">
      <h2 className="font-semibold">Delete Profile</h2>
      <p className="mt-1 mb-4 text-muted-foreground text-sm">
        Deletes every Book this Profile added, for everyone it was Shared with, and all of its
        reading progress, highlights and shelves. This can't be undone.
      </p>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete {name}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${name}?`}
        description={`Type "${name}" to confirm.`}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await remove.mutateAsync(typed)
              navigate('/profiles', { replace: true })
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Something went wrong')
            }
          }}
        >
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" variant="destructive" disabled={!matches || remove.isPending}>
            Delete forever
          </Button>
        </form>
      </Dialog>
    </section>
  )
}
