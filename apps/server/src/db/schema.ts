import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

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
    /** `none`, `everyone` (including Profiles created later) or `named` (book_shares). */
    shareMode: text('share_mode').notNull().default('none'),
    /** When it was Shared with everyone; that is when it counts as added for Recipients. */
    sharedAt: integer('shared_at'),
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

/** Recipients of a Book Shared with named Profiles (ticket 06). */
export const bookShares = sqliteTable(
  'book_shares',
  {
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sharedAt: integer('shared_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.profileId] }),
    index('book_shares_profile').on(t.profileId),
  ],
)

/** A Recipient's "remove from my library"; kept across revoke and re-Share (ticket 06). */
export const hiddenBooks = sqliteTable(
  'hidden_books',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    hiddenAt: integer('hidden_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.bookId] })],
)

/** A Profile's own way to organise Books it can see, owned or Shared (ticket 06). */
export const shelves = sqliteTable(
  'shelves',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Lowercased name; unique per Profile. */
    nameKey: text('name_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('shelves_profile_name').on(t.profileId, t.nameKey)],
)

/** Kept when a Share is revoked, so the Book is back on the shelf if Shared again. */
export const shelfBooks = sqliteTable(
  'shelf_books',
  {
    shelfId: text('shelf_id')
      .notNull()
      .references(() => shelves.id, { onDelete: 'cascade' }),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    addedAt: integer('added_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.shelfId, t.bookId] }), index('shelf_books_book').on(t.bookId)],
)

export type ShelfRow = typeof shelves.$inferSelect

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
    /** Seconds; set for Audio Files only. */
    duration: real('duration'),
    addedAt: integer('added_at').notNull(),
  },
  (t) => [index('files_book').on(t.bookId), index('files_sha256').on(t.sha256)],
)

/** The recordings of an Audio File, in order; each is an ordinary blob. */
export const fileTracks = sqliteTable(
  'file_tracks',
  {
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    sha256: text('sha256').notNull(),
    container: text('container').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    duration: real('duration').notNull(),
    title: text('title'),
    originalName: text('original_name').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fileId, t.position] }),
    index('file_tracks_sha256').on(t.sha256),
  ],
)

/** Chapters of an Audio File; `start` is seconds from the start of the whole File. */
export const fileChapters = sqliteTable(
  'file_chapters',
  {
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    start: real('start').notNull(),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.position] })],
)

export type FileTrackRow = typeof fileTracks.$inferSelect

export type BookRow = typeof books.$inferSelect
export type FileRow = typeof files.$inferSelect

/** Monotonic counters; `sync` hands out the serverSeq that devices pull by (ticket 08). */
export const counters = sqliteTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull(),
})

export const readingProgress = sqliteTable(
  'reading_progress',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    cfi: text('cfi').notNull(),
    fraction: real('fraction').notNull(),
    deviceId: text('device_id').notNull(),
    hlc: text('hlc').notNull(),
    serverSeq: integer('server_seq').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.fileId] }),
    index('reading_progress_seq').on(t.profileId, t.serverSeq),
  ],
)

export const readStatus = sqliteTable(
  'read_status',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    hlc: text('hlc').notNull(),
    serverSeq: integer('server_seq').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.bookId] }),
    index('read_status_seq').on(t.profileId, t.serverSeq),
  ],
)

/** Ids come from the client, so records can be created offline (ticket 08). */
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    cfi: text('cfi').notNull(),
    snippet: text('snippet').notNull(),
    /** Deletes are tombstones, kept so an offline device can't bring the record back. */
    deleted: integer('deleted', { mode: 'boolean' }).notNull(),
    hlc: text('hlc').notNull(),
    serverSeq: integer('server_seq').notNull(),
  },
  (t) => [
    index('bookmarks_file').on(t.profileId, t.fileId),
    index('bookmarks_seq').on(t.profileId, t.serverSeq),
  ],
)

export const highlights = sqliteTable(
  'highlights',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    cfiRange: text('cfi_range').notNull(),
    colour: text('colour').notNull(),
    text: text('text').notNull(),
    /** At most one Note per Highlight, stored on it (GLOSSARY: Note). */
    note: text('note'),
    deleted: integer('deleted', { mode: 'boolean' }).notNull(),
    hlc: text('hlc').notNull(),
    serverSeq: integer('server_seq').notNull(),
  },
  (t) => [
    index('highlights_file').on(t.profileId, t.fileId),
    index('highlights_seq').on(t.profileId, t.serverSeq),
  ],
)

/**
 * What the import folder scan did with each file, per Profile (ticket 09). A file is looked
 * at again only when its size or mtime changes, so deleting its Book doesn't re-import it.
 */
export const importRecords = sqliteTable(
  'import_records',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Relative to the Profile's import folder, so renaming the Profile keeps it. */
    path: text('path').notNull(),
    size: integer('size').notNull(),
    mtimeMs: integer('mtime_ms').notNull(),
    status: text('status').notNull(),
    bookId: text('book_id'),
    title: text('title'),
    message: text('message'),
    at: integer('at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.path] }),
    index('import_records_at').on(t.profileId, t.at),
  ],
)

export type ImportRecordRow = typeof importRecords.$inferSelect
