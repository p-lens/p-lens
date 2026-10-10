-- The bonuses a pachinko machine pays.
--
-- A play in progress records which bonus was won, not how many balls: the
-- balls a bonus pays out and the balls shot to get them are the machine's,
-- stated once here — 1500 paid out for 100 shot is a gain of 1400 — in the
-- order given. They are part of how a machine is described, so an
-- administrator sets them right as the name is, and `described_at` moves.

CREATE TABLE machine_bonuses (
  machine_id TEXT NOT NULL REFERENCES machines (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  payout INTEGER NOT NULL CHECK (payout > 0),
  spent INTEGER NOT NULL CHECK (spent >= 0 AND spent < payout),
  created_at TEXT NOT NULL,
  PRIMARY KEY (machine_id, position)
);
