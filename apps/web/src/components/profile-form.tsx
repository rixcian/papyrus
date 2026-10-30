import { PROFILE_COLOURS, PROFILE_NAME_MAX, type ProfileColour } from '@papyrus/shared'
import { type FormEvent, useId, useState } from 'react'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { colourClass, ProfileAvatar } from './profile-avatar'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: { name: string; colour: ProfileColour }
  submitLabel: string
  onSubmit: (values: { name: string; colour: ProfileColour }) => Promise<unknown>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [colour, setColour] = useState<ProfileColour>(initial?.colour ?? 'blue')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const nameId = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await onSubmit({ name, colour })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <ProfileAvatar name={name || '?'} colour={colour} size="lg" />
        <div className="flex flex-1 flex-col gap-1.5 text-sm">
          <label htmlFor={nameId} className="font-medium">
            Name
          </label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PROFILE_NAME_MAX}
            autoFocus
            required
          />
        </div>
      </div>
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {PROFILE_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={c === colour}
              onClick={() => setColour(c)}
              className={cn(
                'size-8 rounded-full ring-offset-2 ring-offset-background transition',
                colourClass[c],
                c === colour && 'ring-2 ring-foreground',
              )}
            />
          ))}
        </div>
      </fieldset>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={pending || !name.trim()}>
        {submitLabel}
      </Button>
    </form>
  )
}
