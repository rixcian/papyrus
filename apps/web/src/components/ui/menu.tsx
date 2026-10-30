import { Menu as BaseMenu } from '@base-ui/react/menu'
import type { ReactElement, ReactNode } from 'react'

export function Menu({ trigger, children }: { trigger: ReactElement; children: ReactNode }) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={6} align="end">
          <BaseMenu.Popup className="min-w-44 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <BaseMenu.Item
      onClick={onClick}
      className="flex cursor-default select-none items-center rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted"
    >
      {children}
    </BaseMenu.Item>
  )
}
