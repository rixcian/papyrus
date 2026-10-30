import { cn } from '@/lib/utils'

export function BookCover({
  title,
  coverUrl,
  className,
}: {
  title: string
  coverUrl: string | null
  className?: string
}) {
  return (
    <div className={cn('aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm', className)}>
      {coverUrl ? (
        <img src={coverUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center p-3 text-center font-medium text-muted-foreground text-sm">
          {title}
        </div>
      )}
    </div>
  )
}
