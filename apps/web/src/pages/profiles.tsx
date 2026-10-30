import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ProfileAvatar } from '@/components/profile-avatar'
import { ProfileForm } from '@/components/profile-form'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { useCreateProfile, useProfiles, useSession, useSwitchProfile } from '@/lib/session'

export function ProfilesPage() {
  const profiles = useProfiles()
  const session = useSession()
  const switchProfile = useSwitchProfile()
  const create = useCreateProfile()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)

  if (profiles.isPending) return null
  if (profiles.data?.length === 0) return <Navigate to="/welcome" replace />

  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="flex flex-col items-center">
        <h1 className="mb-8 font-semibold text-2xl tracking-tight">Who's reading?</h1>
        <ul className="flex max-w-2xl flex-wrap justify-center gap-6">
          {profiles.data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={async () => {
                  await switchProfile.mutateAsync(p.id)
                  navigate('/', { replace: true })
                }}
                className={cn(
                  'flex w-28 flex-col items-center gap-2 rounded-2xl p-3 transition hover:bg-muted',
                  session.data?.id === p.id && 'bg-muted',
                )}
              >
                <ProfileAvatar name={p.name} colour={p.colour} size="lg" />
                <span className="w-full truncate text-center text-sm">{p.name}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-28 flex-col items-center gap-2 rounded-2xl p-3 transition hover:bg-muted"
            >
              <span className="grid size-20 place-items-center rounded-full border-2 border-border border-dashed text-3xl text-muted-foreground">
                +
              </span>
              <span className="text-muted-foreground text-sm">Add Profile</span>
            </button>
          </li>
        </ul>
      </div>
      <Dialog open={adding} onOpenChange={setAdding} title="Add Profile">
        <ProfileForm
          submitLabel="Create Profile"
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            navigate('/', { replace: true })
          }}
        />
      </Dialog>
    </div>
  )
}
