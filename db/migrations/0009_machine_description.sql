-- How a machine is described, beyond its name.
--
-- A machine has the name it goes by in a parlor, the model name it was
-- approved under (型式名) where that is known, a pachinko machine's 大当り確率
-- as its spec sheet writes it (`1/319.7`), and the words it is searched by:
-- ヴェルヴ for ヴェルトレイヴ, ゲンキ for 幻鬼. A formula is never changed, but how a
-- machine is described is set right by an administrator when someone writes
-- in, and `described_at` says when it last was, so the catalog's version
-- moves and every device takes the description anew.

ALTER TABLE machines ADD COLUMN model_name TEXT;
ALTER TABLE machines ADD COLUMN hit_chance TEXT;
ALTER TABLE machines ADD COLUMN described_at TEXT;

-- Nothing ever wrote an alias: the words a machine is searched by take the
-- table's place, each kept as written and as compared, in the order given.
DROP TABLE machine_aliases;

CREATE TABLE machine_keywords (
  machine_id TEXT NOT NULL REFERENCES machines (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  comparable_keyword TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (machine_id, comparable_keyword)
);

CREATE INDEX machine_keywords_by_keyword ON machine_keywords (comparable_keyword);
