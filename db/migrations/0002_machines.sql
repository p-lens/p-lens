-- Machines of both games, and the other names they are searched by.
--
-- One catalog for pachinko and pachislot: a machine says which game it is,
-- and everything hung on it is in that game's shape. A machine is registered
-- only together with its first formula — a machine nobody can calculate is
-- not one the catalog holds — so the two are written in one batch.
--
-- Nothing registered is ever deleted. What vandals register is hidden by an
-- administrator instead (`hidden_at`, with why), and can be shown again; a
-- hidden machine is delivered to nobody and lets its name go, so the real
-- machine can be registered under it.

CREATE TABLE machines (
  id TEXT PRIMARY KEY NOT NULL,
  game_kind TEXT NOT NULL CHECK (game_kind IN ('pachinko', 'pachislot')),
  name TEXT NOT NULL,
  comparable_name TEXT NOT NULL,
  -- When the machine came out, YYYY-MM-DD; the list opens on the newest.
  released_on TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  hidden_at TEXT,
  hidden_reason TEXT
);

-- A pachinko machine and a pachislot one may share a name; two of one game
-- may not, a hidden one aside.
CREATE UNIQUE INDEX machines_by_name ON machines (game_kind, comparable_name) WHERE hidden_at IS NULL;

-- Other names a machine is searched by: an abbreviation, a former name.
CREATE TABLE machine_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL REFERENCES machines (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (machine_id, alias)
);

CREATE INDEX machine_aliases_by_alias ON machine_aliases (alias);
