import { cn } from '@/lib/utils'

export function BookCover({
  title,
  coverUrl,
  className,
  progress,
}: {
  title: string
  coverUrl: string | null
  className?: string
  /** Fraction read, drawn as a bar along the bottom edge. */
  progress?: number | undefined
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
      {progress !== undefined && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
          <div className="h-full bg-primary" style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
