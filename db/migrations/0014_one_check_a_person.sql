-- A check is a person's word on a formula, not an event: that its basis
-- holds (1), that it does not (-1), or — having found each in turn — both,
-- once each. Neither is taken back; whoever thinks again gives the other,
-- and the two count against each other. Counted every time it was pressed,
-- one person could lift a formula as far as they cared to press.

-- Of the checks a person made of a formula either way, the latest stands.
DELETE FROM formula_verifications
WHERE id NOT IN (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, formula_id, verdict ORDER BY verified_at DESC, id DESC) AS place
    FROM formula_verifications
  )
  WHERE place = 1
);

DROP INDEX formula_verifications_by_user;
CREATE UNIQUE INDEX formula_verifications_by_user ON formula_verifications (user_id, formula_id, verdict);
