import { rgba, useCoverTone } from '@/lib/cover-tone'
import { cn } from '@/lib/utils'

/**
 * The Night glow: a wash of the cover's own colour behind the top of a page. It fades in once
 * the tone is known and stays neutral for a Book with no cover.
 */
export function Ambient({
  coverUrl,
  className,
}: {
  coverUrl: string | null | undefined
  className?: string
}) {
  const tone = useCoverTone(coverUrl)
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] transition-opacity duration-700',
        tone ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={
        tone
          ? {
              background: `radial-gradient(120% 85% at 50% -12%, ${rgba(tone, 0.42)}, ${rgba(tone, 0.08)} 55%, transparent 80%)`,
            }
          : undefined
      }
    />
  )
}

/** Three slow-drifting blobs of the cover's colour, for the full player. */
export function AmbientBlobs({
  coverUrl,
  playing,
}: {
  coverUrl: string | null | undefined
  playing: boolean
}) {
  const tone = useCoverTone(coverUrl)
  if (!tone) return null
  const [r, g, b] = tone
  const shades = [tone, [b, r, g], [Math.round(r * 0.6), Math.round(g * 0.6), Math.round(b * 0.6)]]
  const spots = ['-left-1/4 -top-1/8', '-right-1/3 top-1/5', 'left-1/8 -bottom-1/4']
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {shades.map((shade, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of three
          key={i}
          className={cn(
            'absolute aspect-square w-[75%] max-w-[44rem] animate-drift rounded-full opacity-45 blur-3xl',
            spots[i],
            !playing && '[animation-play-state:paused]',
          )}
          style={{
            background: rgba(shade as [number, number, number], 1),
            animationDuration: `${16 + i * 4}s`,
          }}
        />
      ))}
    </div>
  )
}
