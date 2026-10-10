-- What people do with a 設定配分: adopt it, favour it, use it — a formula's
-- marks, less verification: a 設定配分 is a belief, with no basis to check.

-- "I use this 設定配分": one per person per machine, as a formula's adoption is.
CREATE TABLE distribution_adoptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  machine_id TEXT NOT NULL REFERENCES machines (id),
  distribution_id TEXT NOT NULL REFERENCES distributions (id),
  adopted_at TEXT NOT NULL,
  UNIQUE (user_id, machine_id)
);

CREATE INDEX distribution_adoptions_by_distribution ON distribution_adoptions (distribution_id);

CREATE TABLE distribution_favorites (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  distribution_id TEXT NOT NULL REFERENCES distributions (id),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, distribution_id)
);

CREATE INDEX distribution_favorites_by_distribution ON distribution_favorites (distribution_id);

-- One row per play started with a 設定配分. A statistic, nothing more.
CREATE TABLE distribution_uses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  distribution_id TEXT NOT NULL REFERENCES distributions (id),
  used_at TEXT NOT NULL
);

CREATE INDEX distribution_uses_by_distribution ON distribution_uses (distribution_id);
