-- How long a line nobody reads or adds to is kept, as the device that made
-- it said (`LineKeep`): `lasting`, a book's, an inbox's or a huddle's line,
-- and `passing`, a line of one day's plays, which is let go sooner and whose
-- owner is not kept after it, since nobody makes it again. Every line made
-- before there were two is lasting, as one made without saying is.
ALTER TABLE lines ADD COLUMN keep TEXT NOT NULL DEFAULT 'lasting' CHECK (keep IN ('lasting', 'passing'));
