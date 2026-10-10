-- When a line was last read or added to, to the day. A line nobody has
-- touched for a while is let go whole (`letGoOfIdleLines`): the relay only
-- carries commits between a book's devices, each of which keeps the book,
-- and whichever comes back first makes the line again from what it has.
ALTER TABLE lines ADD COLUMN used_at TEXT;

-- A line made before its use was kept counts as used now, so none is let
-- go for having been idle before anybody was counting.
UPDATE lines SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
