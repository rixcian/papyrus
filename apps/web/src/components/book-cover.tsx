import { HeadphonesIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BookCover({
  title,
  coverUrl,
  className,
  progress,
  audio,
}: {
  title: string
  coverUrl: string | null
  className?: string
  /** Fraction read, drawn as a bar along the bottom edge. */
  progress?: number | undefined
  /** The Book has an Audio File: a headphones badge in the corner. */
  audio?: boolean | undefined
}) {
  return (
    <div
      className={cn(
        'relative aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm',
        className,
      )}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center p-3 text-center font-medium text-muted-foreground text-sm">
          {title}
        </div>
      )}
      {audio && (
        <span
          role="img"
          aria-label="Has audiobook"
          className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white"
        >
          <HeadphonesIcon className="size-3.5" />
        </span>
      )}
      {progress !== undefined && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
          <div className="h-full bg-primary" style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
