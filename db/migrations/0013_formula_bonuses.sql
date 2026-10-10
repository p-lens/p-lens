-- A pachinko machine's bonuses are a formula's to state, not the machine's.
--
-- What a bonus pays out and takes is what the formula's own jackpots do —
-- so many rounds through such an attacker — so a formula worked out from a
-- basis names its bonuses and no more, and one typed in states them whole.
-- A play records a jackpot as one of the bonuses of the formula it is
-- weighed against.
--
-- Every formula of a pachinko machine takes the bonuses its machine listed,
-- as they stood; `machine_bonuses` is read no more. A formula's bonuses are
-- kept with it for good, like the rest of it.

ALTER TABLE formulas ADD COLUMN bonuses_json TEXT;

UPDATE formulas
SET bonuses_json = (
  SELECT json_group_array(json_object('name', name, 'payout', payout, 'spent', spent))
  FROM (SELECT b.name, b.payout, b.spent FROM machine_bonuses b WHERE b.machine_id = formulas.machine_id ORDER BY b.position)
)
WHERE machine_id IN (SELECT id FROM machines WHERE game_kind = 'pachinko');

DROP TRIGGER formulas_are_immutable;

CREATE TRIGGER formulas_are_immutable
BEFORE UPDATE OF id, machine_id, kind, figures_json, basis_json, normalized_spec_json, engine_schema_version, sampling_json, bonuses_json, derived_from, content_hash, created_by, created_at ON formulas
BEGIN SELECT RAISE(ABORT, 'formulas are immutable'); END;
