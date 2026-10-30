import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Lowercased name; uniqueness is case-insensitive. */
  nameKey: text('name_key').notNull().unique(),
  colour: text('colour').notNull(),
  createdAt: integer('created_at').notNull(),
})

export type ProfileRow = typeof profiles.$inferSelect

export const books = sqliteTable(
  'books',
  {
    id: text('id').primaryKey(),
    ownerProfileId: text('owner_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sortTitle: text('sort_title').notNull(),
    description: text('description'),
    language: text('language'),
    publisher: text('publisher'),
    publishedDate: text('published_date'),
    isbn: text('isbn'),
    seriesName: text('series_name'),
    seriesIndex: real('series_index'),
    /** Folded title + first author, for matching new Files to this Book (ticket 09). */
    matchKey: text('match_key').notNull(),
    coverExt: text('cover_ext'),
    addedAt: integer('added_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('books_owner_added').on(t.ownerProfileId, t.addedAt),
    index('books_owner_isbn').on(t.ownerProfileId, t.isbn),
    index('books_owner_match').on(t.ownerProfileId, t.matchKey),
  ],
)

export const bookAuthors = sqliteTable(
  'book_authors',
  {
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookId, t.position] }), index('book_authors_name').on(t.name)],
)

export const bookTags = sqliteTable(
  'book_tags',
  {
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookId, t.tag] }), index('book_tags_tag').on(t.tag)],
)

export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    /** The content-addressed blob; identical bytes share one blob (ticket 09). */
    sha256: text('sha256').notNull(),
    format: text('format').notNull(),
    originalName: text('original_name').notNull(),
    size: integer('size').notNull(),
    addedAt: integer('added_at').notNull(),
  },
  (t) => [index('files_book').on(t.bookId), index('files_sha256').on(t.sha256)],
)

export type BookRow = typeof books.$inferSelect
export type FileRow = typeof files.$inferSelect
