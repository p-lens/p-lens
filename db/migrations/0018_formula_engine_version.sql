-- A formula says which engine checked its figures.
--
-- An engine's version is raised whenever the same basis could come to other
-- figures, so a formula checked by an older one can be found and looked at
-- again. It is the version of the engine that checked the figures against
-- the basis when the formula was stored, and none where nothing did: a
-- formula typed in, or one stored unchecked as its sender's device solved
-- it. Every formula stored before says none, since which engine checked it
-- was not kept; nothing else about it changes.

ALTER TABLE formulas ADD COLUMN engine_version INTEGER CHECK (engine_version IS NULL OR engine_version > 0);

DROP TRIGGER formulas_are_immutable;

CREATE TRIGGER formulas_are_immutable
BEFORE UPDATE OF id, machine_id, kind, figures_json, basis_json, normalized_spec_json, engine_schema_version, engine_version, sampling_json, bonuses_json, derived_from, content_hash, created_by, created_at, checked ON formulas
BEGIN SELECT RAISE(ABORT, 'formulas are immutable'); END;
