-- A line: the sealed commits of one book being synced, in the order the relay
-- took them. Its id is worked out by its devices from their shared secret,
-- and so is the token whose SHA-256 is kept here: whoever sends a line's
-- first commits makes it, and only that token reads or adds to it after.
CREATE TABLE lines (
  id TEXT PRIMARY KEY,
  access_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- One sealed commit at its place in its line, counted from 1 with no gaps.
-- A commit is on a line once: sent again after an answer was lost, it is
-- refused, and its device finds it there when it next reads the line.
CREATE TABLE entries (
  line_id TEXT NOT NULL REFERENCES lines (id),
  seq INTEGER NOT NULL,
  commit_id TEXT NOT NULL,
  box TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (line_id, seq),
  UNIQUE (line_id, commit_id)
);
