import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Library } from '../books/library.ts'
import { IN_LIBRARY_SQL } from '../books/visibility.ts'
import type { Db } from '../db/client.ts'
import { type ShelfRow, shelfBooks, shelves } from '../db/schema.ts'
import { AppError, notFound } from '../errors.ts'

export const SHELF_NAME_MAX = 64

export interface Shelf {
  id: string
  name: string
  /** Books on it that are in the Profile's library right now. */
  count: number
}

const nameKey = (name: string) => name.toLocaleLowerCase('en')

/**
 * A Profile's shelves. They hold any Book the Profile can see, owned or Shared. Entries for
 * a Book whose Share was revoked or that was hidden stay, out of sight, until it is back
 * (ticket 06).
 */
export class ShelfService {
  private readonly db: Db
  private readonly library: Library

  constructor(db: Db, library: Library) {
    this.db = db
    this.library = library
  }

  list(profileId: string): Shelf[] {
    return this.db.$client
      .prepare(
        `SELECT sh.id AS id, sh.name AS name,
           (SELECT count(*) FROM shelf_books sb JOIN books b ON b.id = sb.book_id
            WHERE sb.shelf_id = sh.id AND ${IN_LIBRARY_SQL}) AS count
         FROM shelves sh WHERE sh.profile_id = @profileId
         ORDER BY sh.name_key`,
      )
      .all({ profileId }) as Shelf[]
  }

  /** The Profile's shelves that hold this Book. */
  shelvesOf(profileId: string, bookId: string): { id: string; name: string }[] {
    return this.db
      .select({ id: shelves.id, name: shelves.name })
      .from(shelfBooks)
      .innerJoin(shelves, eq(shelves.id, shelfBooks.shelfId))
      .where(and(eq(shelves.profileId, profileId), eq(shelfBooks.bookId, bookId)))
      .orderBy(asc(shelves.nameKey))
      .all()
  }

  create(profileId: string, name: string): Shelf {
    this.assertFree(profileId, name)
    const id = randomUUID()
    this.db
      .insert(shelves)
      .values({ id, profileId, name, nameKey: nameKey(name), createdAt: Date.now() })
      .run()
    return { id, name, count: 0 }
  }

  rename(profileId: string, shelfId: string, name: string): Shelf {
    const shelf = this.own(profileId, shelfId)
    if (nameKey(name) !== shelf.nameKey) this.assertFree(profileId, name)
    this.db
      .update(shelves)
      .set({ name, nameKey: nameKey(name) })
      .where(eq(shelves.id, shelf.id))
      .run()
    return this.list(profileId).find((s) => s.id === shelf.id) as Shelf
  }

  /** Deleting a shelf never touches the Books on it. */
  delete(profileId: string, shelfId: string): void {
    this.db
      .delete(shelves)
      .where(eq(shelves.id, this.own(profileId, shelfId).id))
      .run()
  }

  /** Bulk add and remove, for Book detail and multi-select. Every Book must be visible. */
  update(profileId: string, shelfId: string, add: string[], remove: string[]): Shelf {
    const shelf = this.own(profileId, shelfId)
    for (const bookId of new Set(add)) this.library.visibleBook(profileId, bookId)
    const now = Date.now()
    this.db.transaction((tx) => {
      for (const bookId of new Set(add))
        tx.insert(shelfBooks)
          .values({ shelfId: shelf.id, bookId, addedAt: now })
          .onConflictDoNothing()
          .run()
      if (remove.length)
        tx.delete(shelfBooks)
          .where(and(eq(shelfBooks.shelfId, shelf.id), inArray(shelfBooks.bookId, remove)))
          .run()
    })
    return this.list(profileId).find((s) => s.id === shelf.id) as Shelf
  }

  /** 404 for another Profile's shelf, as for Books. */
  private own(profileId: string, shelfId: string): ShelfRow {
    const shelf = this.db
      .select()
      .from(shelves)
      .where(and(eq(shelves.id, shelfId), eq(shelves.profileId, profileId)))
      .get()
    if (!shelf) throw notFound('Shelf')
    return shelf
  }

  private assertFree(profileId: string, name: string): void {
    const taken = this.db
      .select({ id: shelves.id })
      .from(shelves)
      .where(and(eq(shelves.profileId, profileId), eq(shelves.nameKey, nameKey(name))))
      .get()
    if (taken) throw new AppError(409, 'shelf_exists', `You already have a shelf called “${name}”`)
  }
}
