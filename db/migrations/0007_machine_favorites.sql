-- "A machine I look at often". Says nothing about any formula: a machine's
-- favourite and a formula's are different things, never merged.

CREATE TABLE machine_favorites (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  machine_id TEXT NOT NULL REFERENCES machines (id),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, machine_id)
);
