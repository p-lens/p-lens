-- 設定配分: how parlors are thought to spread a pachislot machine's setting
-- levels — the prior what is seen at a cabinet updates. Registered for a
-- machine and stood behind the way a formula is. A pachinko machine has no
-- setting levels, so the API registers these only on a pachislot machine.
--
-- Labelled by its maker (平日, 旧イベント日); its shares as JSON, in hundredths
-- of a percent. Immutable, remade as a new one naming what it was remade from;
-- only whether an administrator hid it ever changes.

CREATE TABLE distributions (
  id TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL REFERENCES machines (id),
  label TEXT NOT NULL,
  shares_json TEXT NOT NULL,
  derived_from TEXT REFERENCES distributions (id),
  content_hash TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  hidden_at TEXT,
  hidden_reason TEXT
);

CREATE INDEX distributions_by_machine ON distributions (machine_id);

CREATE TRIGGER distributions_are_immutable
BEFORE UPDATE OF id, machine_id, label, shares_json, derived_from, content_hash, created_by, created_at ON distributions
BEGIN SELECT RAISE(ABORT, 'distributions are immutable'); END;

CREATE TRIGGER distributions_are_kept BEFORE DELETE ON distributions
BEGIN SELECT RAISE(ABORT, 'distributions are immutable'); END;
