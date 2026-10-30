import { PlusIcon } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { useCreateShelf, useShelves, useUpdateShelfBooks } from '@/lib/shelves'
import { ShelfNameDialog } from './shelf-dialogs'

/**
 * Puts Books on shelves. For one Book (`onShelves` given) each shelf is a checkbox; for a
 * multi-select each shelf adds them all. "New shelf…" creates one with the Books on it.
 */
export function ShelvesMenu({
  bookIds,
  onShelves,
  trigger,
  onDone,
}: {
  bookIds: string[]
  /** Shelves the single Book is on already. */
  onShelves?: string[]
  trigger: ReactElement
  onDone?: () => void
}) {
  const shelves = useShelves()
  const create = useCreateShelf()
  const update = useUpdateShelfBooks()
  const [creating, setCreating] = useState(false)
  const on = new Set(onShelves ?? [])

  return (
    <>
      <Menu>
        <MenuTrigger render={trigger} />
        <MenuPopup align="start" className="min-w-48">
          {(shelves.data ?? []).map((shelf) =>
            onShelves ? (
              <MenuCheckboxItem
                key={shelf.id}
                checked={on.has(shelf.id)}
                onCheckedChange={(checked) =>
                  update.mutate({
                    shelfId: shelf.id,
                    ...(checked ? { add: bookIds } : { remove: bookIds }),
                  })
                }
              >
                {shelf.name}
              </MenuCheckboxItem>
            ) : (
              <MenuItem
                key={shelf.id}
                onClick={() =>
                  update.mutate({ shelfId: shelf.id, add: bookIds }, { onSuccess: onDone })
                }
              >
                {shelf.name}
              </MenuItem>
            ),
          )}
          {(shelves.data?.length ?? 0) > 0 && <MenuSeparator />}
          <MenuItem onClick={() => setCreating(true)}>
            <PlusIcon />
            New shelf…
          </MenuItem>
        </MenuPopup>
      </Menu>
      {creating && (
        <ShelfNameDialog
          open={creating}
          onOpenChange={setCreating}
          title="New shelf"
          submitLabel="Create"
          onSubmit={async (name) => {
            const shelf = await create.mutateAsync(name)
            await update.mutateAsync({ shelfId: shelf.id, add: bookIds })
            onDone?.()
          }}
        />
      )}
    </>
  )
}
