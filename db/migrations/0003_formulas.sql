-- Formulas (算出条件): what people make of a machine, kept forever.
--
-- A formula keeps its figures as JSON in the shape its machine's game gives
-- them, and its basis — a pachinko formula's 期待値基礎値, a pachislot
-- formula's 解析値 — likewise, so this table never learns a game's figures.
-- Which engine checks a formula is the API's to say, from its machine's game.
--
-- Typed in (`manual`), worked out exactly from its basis (`simulated`), or
-- sampled from it (`sampled`, which keeps how, so the sampling can be run
-- again). A pachinko formula typed in has no basis; every other formula has
-- one, with the normalised spec the API made of it. Immutable: one found
-- wanting is made again, naming what it was remade from. Only whether it is
-- hidden — vandalism, hidden by an administrator — ever changes.

CREATE TABLE formulas (
  id TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL REFERENCES machines (id),
  kind TEXT NOT NULL CHECK (kind IN ('manual', 'simulated', 'sampled')),
  figures_json TEXT NOT NULL,
  basis_json TEXT,
  normalized_spec_json TEXT,
  engine_schema_version INTEGER,
  sampling_json TEXT,
  derived_from TEXT REFERENCES formulas (id),
  content_hash TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  hidden_at TEXT,
  hidden_reason TEXT,
  CHECK ((basis_json IS NULL) = (normalized_spec_json IS NULL) AND (basis_json IS NULL) = (engine_schema_version IS NULL)),
  CHECK (kind = 'manual' OR basis_json IS NOT NULL),
  CHECK ((kind = 'sampled') = (sampling_json IS NOT NULL))
);

CREATE INDEX formulas_by_machine ON formulas (machine_id);

CREATE TRIGGER formulas_are_immutable
BEFORE UPDATE OF id, machine_id, kind, figures_json, basis_json, normalized_spec_json, engine_schema_version, sampling_json, derived_from, content_hash, created_by, created_at ON formulas
BEGIN SELECT RAISE(ABORT, 'formulas are immutable'); END;

CREATE TRIGGER formulas_are_kept BEFORE DELETE ON formulas
BEGIN SELECT RAISE(ABORT, 'formulas are immutable'); END;
