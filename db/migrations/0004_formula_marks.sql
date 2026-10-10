-- What people do with a formula: adopt or reject it, verify or refute it,
-- favour it, use it. Each says something different, so each is a table of its
-- own; a formula's standing is their counts, a rejection or a refutation
-- counting against it, and ranking is the reader's.

-- "I use this formula": one per person per machine. The machine is kept beside
-- the formula it is implied by, so the database can hold a person to one.
CREATE TABLE formula_adoptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  machine_id TEXT NOT NULL REFERENCES machines (id),
  formula_id TEXT NOT NULL REFERENCES formulas (id),
  adopted_at TEXT NOT NULL,
  UNIQUE (user_id, machine_id)
);

CREATE INDEX formula_adoptions_by_formula ON formula_adoptions (formula_id);

-- "I would not use this formula": any number per person, one per formula. A
-- person never both adopts and rejects one formula; the API lets go of the
-- other when one is set.
CREATE TABLE formula_rejections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  formula_id TEXT NOT NULL REFERENCES formulas (id),
  rejected_at TEXT NOT NULL,
  UNIQUE (user_id, formula_id)
);

CREATE INDEX formula_rejections_by_formula ON formula_rejections (formula_id);

-- "I checked its basis": a professional's verdict, that it holds (1) or that
-- it does not (-1). A check is an event, not a standing: the same person may
-- check a formula again and again, and find it wanting after finding it good,
-- so every check is a row of its own. Only a formula worked out from a basis
-- — simulated or sampled — has one to check; the API refuses the rest.
CREATE TABLE formula_verifications (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  formula_id TEXT NOT NULL REFERENCES formulas (id),
  verdict INTEGER NOT NULL CHECK (verdict IN (1, -1)),
  verified_at TEXT NOT NULL
);

CREATE INDEX formula_verifications_by_formula ON formula_verifications (formula_id);
CREATE INDEX formula_verifications_by_user ON formula_verifications (user_id, formula_id);

-- "Choose this for me next time". Barely a vote; never a machine's favourite.
CREATE TABLE formula_favorites (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  formula_id TEXT NOT NULL REFERENCES formulas (id),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, formula_id)
);

CREATE INDEX formula_favorites_by_formula ON formula_favorites (formula_id);

-- One row per play started with a formula. A statistic, nothing more.
CREATE TABLE formula_uses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  formula_id TEXT NOT NULL REFERENCES formulas (id),
  used_at TEXT NOT NULL
);

CREATE INDEX formula_uses_by_formula ON formula_uses (formula_id);
