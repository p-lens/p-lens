-- Tags people make, and what they put them on: a machine, a formula or a
-- 設定配分.

CREATE TABLE tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL
);

-- A tag on something. The target is polymorphic, so it has no foreign key;
-- the API checks that the target exists for its type before writing a row.
CREATE TABLE taggings (
  id TEXT PRIMARY KEY NOT NULL,
  tag_id TEXT NOT NULL REFERENCES tags (id),
  target_type TEXT NOT NULL CHECK (target_type IN ('machine', 'formula', 'distribution')),
  target_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  UNIQUE (tag_id, target_type, target_id)
);

CREATE INDEX taggings_by_target ON taggings (target_type, target_id);
CREATE INDEX taggings_by_tag ON taggings (tag_id);
