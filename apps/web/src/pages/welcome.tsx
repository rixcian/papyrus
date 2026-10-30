import { Navigate, useNavigate } from 'react-router'
import { ProfileForm } from '@/components/profile-form'
import { useCreateProfile, useProfiles } from '@/lib/session'

/** First run: there are no Profiles yet (ticket 07). */
export function WelcomePage() {
  const profiles = useProfiles()
  const create = useCreateProfile()
  const navigate = useNavigate()

  // "/" rather than the picker: creating the first Profile also made it the Active Profile.
  if (profiles.data && profiles.data.length > 0) return <Navigate to="/" replace />

  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-semibold text-2xl tracking-tight">Welcome to Papyrus</h1>
        <p className="mt-1 mb-6 text-muted-foreground text-sm">
          Create your first Profile. Everyone who reads here gets their own.
        </p>
        <ProfileForm
          submitLabel="Create Profile"
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            navigate('/', { replace: true })
          }}
        />
      </div>
    </div>
  )
}
