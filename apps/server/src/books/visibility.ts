/**
 * Who sees which Book, as SQL over a `books b` row and a `@profileId` parameter (ticket 06).
 * Every query that lists or opens Books goes through these, so the rule lives in one place.
 */

/** The Profile owns the Book, or it is Shared with everyone or with this Profile. */
export const VISIBLE_SQL = `(b.owner_profile_id = @profileId
  OR b.share_mode = 'everyone'
  OR (b.share_mode = 'named' AND EXISTS (
    SELECT 1 FROM book_shares s WHERE s.book_id = b.id AND s.profile_id = @profileId)))`

/** The Profile removed this Shared Book from its library. */
export const HIDDEN_SQL = `EXISTS (
  SELECT 1 FROM hidden_books h WHERE h.book_id = b.id AND h.profile_id = @profileId)`

/** In the library: visible and not hidden. */
export const IN_LIBRARY_SQL = `(${VISIBLE_SQL} AND NOT ${HIDDEN_SQL})`

/** When the Book was added, as this Profile sees it: a Shared Book counts from its Share. */
export const ADDED_SQL = `(CASE
  WHEN b.owner_profile_id = @profileId THEN b.added_at
  WHEN b.share_mode = 'everyone' THEN b.shared_at
  ELSE (SELECT s.shared_at FROM book_shares s WHERE s.book_id = b.id AND s.profile_id = @profileId)
END)`
