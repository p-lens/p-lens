-- Whose a line was, kept after the line is let go: its id and the SHA-256
-- of the token that made it, and nothing else of it. A line let go is made
-- again by its first commits, and without this whoever sent them would be
-- its owner — anyone who knew its id, which everyone let into it does. So
-- a line that was once made is made again only with the token that made it
-- before. A row is taken away when its line is made again, and otherwise
-- stays: it is all that stands between a line left idle and someone else.
CREATE TABLE owners_kept (
  line_id TEXT PRIMARY KEY,
  access_hash TEXT NOT NULL,
  let_go_at TEXT NOT NULL
);
