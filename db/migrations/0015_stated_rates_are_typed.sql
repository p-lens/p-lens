-- A pachislot formula whose 機械割 was stated — measured, or given for an
-- AT's medals to follow from — is one typed in, whatever else it lists: its
-- 機械割 was not worked out from its 解析値, and there is nothing in them to
-- check it by. The formulas registered in bulk were all stored as worked
-- out. They are told what they are; nothing they hold is changed, and what
-- identifies their content does not cover how they were made.

DROP TRIGGER formulas_are_immutable;

UPDATE formulas
SET kind = 'manual'
WHERE kind = 'simulated'
  AND machine_id IN (SELECT id FROM machines WHERE game_kind = 'pachislot')
  AND (
    json_extract(basis_json, '$.conditions.payoutRate.type') = 'measured'
    OR EXISTS (SELECT 1 FROM json_each(basis_json, '$.spec.components.rate'))
  );

-- A formula typed in has no basis to check, so no check stands on one.
DELETE FROM formula_verifications
WHERE formula_id IN (SELECT id FROM formulas WHERE kind = 'manual');

CREATE TRIGGER formulas_are_immutable
BEFORE UPDATE OF id, machine_id, kind, figures_json, basis_json, normalized_spec_json, engine_schema_version, sampling_json, bonuses_json, derived_from, content_hash, created_by, created_at ON formulas
BEGIN SELECT RAISE(ABORT, 'formulas are immutable'); END;
