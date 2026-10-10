-- A spec says which shape it is written in.
--
-- A formula's basis keeps its spec as it was sent: the entities, a table per
-- component and the resources. Specs now carry `v`, the version of that
-- shape, so an engine met with a later one refuses it by its number rather
-- than misread it. Every spec stored before then is in the first shape and
-- said nothing; this says it for them.
--
-- Nothing a formula means changes: its figures, its entities, its components
-- and its resources are as they were sent. That is why the rule that a
-- formula is never rewritten is lifted for this one statement and put back
-- as it was — a formula is still made again, never edited. `content_hash`
-- is left as the hash of what was sent, before the shape had a number.

DROP TRIGGER formulas_are_immutable;

UPDATE formulas
SET basis_json = json_set(basis_json, '$.spec.v', 1)
WHERE basis_json IS NOT NULL AND json_type(basis_json, '$.spec.v') IS NULL;

CREATE TRIGGER formulas_are_immutable
BEFORE UPDATE OF id, machine_id, kind, figures_json, basis_json, normalized_spec_json, engine_schema_version, sampling_json, derived_from, content_hash, created_by, created_at ON formulas
BEGIN SELECT RAISE(ABORT, 'formulas are immutable'); END;
