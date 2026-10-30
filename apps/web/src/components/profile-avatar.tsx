import { type ProfileColour, profileInitial } from '@papyrus/shared'
import { cn } from '@/lib/utils'

export const colourClass: Record<ProfileColour, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  green: 'bg-green-600',
  teal: 'bg-teal-600',
  blue: 'bg-blue-600',
  indigo: 'bg-indigo-600',
  purple: 'bg-purple-600',
  pink: 'bg-pink-500',
  slate: 'bg-slate-600',
}

export function ProfileAvatar({
  name,
  colour,
  size = 'md',
}: {
  name: string
  colour: ProfileColour
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white',
        colourClass[colour],
        size === 'sm' && 'size-8 text-sm',
        size === 'md' && 'size-12 text-lg',
        size === 'lg' && 'size-20 text-3xl',
      )}
    >
      {profileInitial(name)}
    </span>
  )
}
