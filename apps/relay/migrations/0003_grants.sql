-- A grant: one more token a line answers to, for one person its owner let
-- in, and what that token may do — read the line, add to it too, or add to
-- it without reading it, as someone does who only sends things in. The
-- token's SHA-256 is kept, as a line's own is; who the person is, the relay
-- is never told. A grant taken away is deleted, and its token then opens
-- nothing. A line's grants go with the line when it is let go.
CREATE TABLE grants (
  line_id TEXT NOT NULL REFERENCES lines (id),
  id TEXT NOT NULL,
  access_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer', 'sender')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (line_id, id)
);

CREATE INDEX grants_by_access ON grants (line_id, access_hash);
