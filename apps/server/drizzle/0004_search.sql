-- Library search (ticket 06). books_fts holds one row per Book, with its authors, series
-- and tags joined in. Triggers rebuild a Book's row whenever it or its authors or tags change.
-- book_id is UNINDEXED: books has a text key, and its implicit rowid can change on VACUUM.
CREATE VIRTUAL TABLE books_fts USING fts5(
  book_id UNINDEXED, title, authors, series, tags, description,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
--> statement-breakpoint
INSERT INTO books_fts (book_id, title, authors, series, tags, description)
  SELECT b.id, b.title,
    (SELECT group_concat(name, ' ') FROM (SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position)),
    b.series_name,
    (SELECT group_concat(tag, ' ') FROM book_tags WHERE book_id = b.id),
    b.description
  FROM books b;
--> statement-breakpoint
CREATE TRIGGER books_fts_insert AFTER INSERT ON books BEGIN
  DELETE FROM books_fts WHERE book_id = NEW.id;
  INSERT INTO books_fts (book_id, title, authors, series, tags, description)
    SELECT b.id, b.title,
      (SELECT group_concat(name, ' ') FROM (SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position)),
      b.series_name,
      (SELECT group_concat(tag, ' ') FROM book_tags WHERE book_id = b.id),
      b.description
    FROM books b WHERE b.id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER books_fts_update AFTER UPDATE OF title, series_name, description ON books BEGIN
  DELETE FROM books_fts WHERE book_id = NEW.id;
  INSERT INTO books_fts (book_id, title, authors, series, tags, description)
    SELECT b.id, b.title,
      (SELECT group_concat(name, ' ') FROM (SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position)),
      b.series_name,
      (SELECT group_concat(tag, ' ') FROM book_tags WHERE book_id = b.id),
      b.description
    FROM books b WHERE b.id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER books_fts_delete AFTER DELETE ON books BEGIN
  DELETE FROM books_fts WHERE book_id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER authors_fts_insert AFTER INSERT ON book_authors BEGIN
  DELETE FROM books_fts WHERE book_id = NEW.book_id;
  INSERT INTO books_fts (book_id, title, authors, series, tags, description)
    SELECT b.id, b.title,
      (SELECT group_concat(name, ' ') FROM (SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position)),
      b.series_name,
      (SELECT group_concat(tag, ' ') FROM book_tags WHERE book_id = b.id),
      b.description
    FROM books b WHERE b.id = NEW.book_id;
END;
--> statement-breakpoint
CREATE TRIGGER authors_fts_delete AFTER DELETE ON book_authors BEGIN
  DELETE FROM books_fts WHERE book_id = OLD.book_id;
  INSERT INTO books_fts (book_id, title, authors, series, tags, description)
    SELECT b.id, b.title,
      (SELECT group_concat(name, ' ') FROM (SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position)),
      b.series_name,
      (SELECT group_concat(tag, ' ') FROM book_tags WHERE book_id = b.id),
      b.description
    FROM books b WHERE b.id = OLD.book_id;
END;
--> statement-breakpoint
CREATE TRIGGER tags_fts_insert AFTER INSERT ON book_tags BEGIN
  DELETE FROM books_fts WHERE book_id = NEW.book_id;
  INSERT INTO books_fts (book_id, title, authors, series, tags, description)
    SELECT b.id, b.title,
      (SELECT group_concat(name, ' ') FROM (SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position)),
      b.series_name,
      (SELECT group_concat(tag, ' ') FROM book_tags WHERE book_id = b.id),
      b.description
    FROM books b WHERE b.id = NEW.book_id;
END;
--> statement-breakpoint
CREATE TRIGGER tags_fts_delete AFTER DELETE ON book_tags BEGIN
  DELETE FROM books_fts WHERE book_id = OLD.book_id;
  INSERT INTO books_fts (book_id, title, authors, series, tags, description)
    SELECT b.id, b.title,
      (SELECT group_concat(name, ' ') FROM (SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position)),
      b.series_name,
      (SELECT group_concat(tag, ' ') FROM book_tags WHERE book_id = b.id),
      b.description
    FROM books b WHERE b.id = OLD.book_id;
END;
--> statement-breakpoint
CREATE TRIGGER authors_fts_update AFTER UPDATE ON book_authors BEGIN
  DELETE FROM books_fts WHERE book_id = NEW.book_id;
  INSERT INTO books_fts (book_id, title, authors, series, tags, description)
    SELECT b.id, b.title,
      (SELECT group_concat(name, ' ') FROM (SELECT name FROM book_authors WHERE book_id = b.id ORDER BY position)),
      b.series_name,
      (SELECT group_concat(tag, ' ') FROM book_tags WHERE book_id = b.id),
      b.description
    FROM books b WHERE b.id = NEW.book_id;
END;
