import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 bg-black/40 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseDialog.Popup
          className={cn(
            '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-lg',
            className,
          )}
        >
          <BaseDialog.Title className="font-semibold text-lg">{title}</BaseDialog.Title>
          {description && (
            <BaseDialog.Description className="mt-1 text-muted-foreground text-sm">
              {description}
            </BaseDialog.Description>
          )}
          <div className="mt-4">{children}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
