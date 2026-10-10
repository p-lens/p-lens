-- What was registered lately, by whom and from where: the ledger a
-- registration is counted against, so that one device, or one address, can
-- register only so much in a day. A row is kept for a day and no longer;
-- the address is a hash, never the address itself.

CREATE TABLE registrations (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('machine', 'addition', 'tag')),
  user_id TEXT NOT NULL REFERENCES users (id),
  address_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX registrations_by_user ON registrations (user_id, kind, created_at);
CREATE INDEX registrations_by_address ON registrations (address_hash, kind, created_at);
