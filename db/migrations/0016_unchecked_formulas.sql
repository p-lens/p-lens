-- A pachislot formula whose 解析値 take more work to solve than the API
-- may spend on one request is stored as its sender's device solved it, and
-- said to be so: the API did not check it. Every formula stored before was
-- checked.

ALTER TABLE formulas ADD COLUMN checked INTEGER NOT NULL DEFAULT 1 CHECK (checked IN (0, 1));

DROP TRIGGER formulas_are_immutable;

CREATE TRIGGER formulas_are_immutable
BEFORE UPDATE OF id, machine_id, kind, figures_json, basis_json, normalized_spec_json, engine_schema_version, sampling_json, bonuses_json, derived_from, content_hash, created_by, created_at, checked ON formulas
BEGIN SELECT RAISE(ABORT, 'formulas are immutable'); END;
