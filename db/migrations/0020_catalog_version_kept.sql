-- The catalog's version was a hash worked out on every ask, by counting and
-- scanning ten tables: thousands of rows read to say nothing has changed. It
-- is now kept in one row, given a fresh random value whenever anything the
-- catalog delivers is written, whoever writes it and however: the API, an
-- administrator straight at the database, or a migration rewriting what is
-- stored. Random, not counted, so that a database restored from a backup
-- never comes to call different contents by a version a device already holds.
--
-- Uses stay out, a statistic never worth a delivery of its own.

CREATE TABLE catalog_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL
);

INSERT INTO catalog_version (id, version) VALUES (1, lower(hex(randomblob(16))));

CREATE TRIGGER machines_insert_moves_catalog_version AFTER INSERT ON machines BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER machines_update_moves_catalog_version AFTER UPDATE ON machines BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER machines_delete_moves_catalog_version AFTER DELETE ON machines BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER machine_keywords_insert_moves_catalog_version AFTER INSERT ON machine_keywords BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER machine_keywords_update_moves_catalog_version AFTER UPDATE ON machine_keywords BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER machine_keywords_delete_moves_catalog_version AFTER DELETE ON machine_keywords BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER formulas_insert_moves_catalog_version AFTER INSERT ON formulas BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formulas_update_moves_catalog_version AFTER UPDATE ON formulas BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formulas_delete_moves_catalog_version AFTER DELETE ON formulas BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER distributions_insert_moves_catalog_version AFTER INSERT ON distributions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER distributions_update_moves_catalog_version AFTER UPDATE ON distributions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER distributions_delete_moves_catalog_version AFTER DELETE ON distributions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER formula_adoptions_insert_moves_catalog_version AFTER INSERT ON formula_adoptions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formula_adoptions_update_moves_catalog_version AFTER UPDATE ON formula_adoptions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formula_adoptions_delete_moves_catalog_version AFTER DELETE ON formula_adoptions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER formula_rejections_insert_moves_catalog_version AFTER INSERT ON formula_rejections BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formula_rejections_update_moves_catalog_version AFTER UPDATE ON formula_rejections BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formula_rejections_delete_moves_catalog_version AFTER DELETE ON formula_rejections BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER formula_verifications_insert_moves_catalog_version AFTER INSERT ON formula_verifications BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formula_verifications_update_moves_catalog_version AFTER UPDATE ON formula_verifications BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formula_verifications_delete_moves_catalog_version AFTER DELETE ON formula_verifications BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER formula_favorites_insert_moves_catalog_version AFTER INSERT ON formula_favorites BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formula_favorites_update_moves_catalog_version AFTER UPDATE ON formula_favorites BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER formula_favorites_delete_moves_catalog_version AFTER DELETE ON formula_favorites BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER distribution_adoptions_insert_moves_catalog_version AFTER INSERT ON distribution_adoptions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER distribution_adoptions_update_moves_catalog_version AFTER UPDATE ON distribution_adoptions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER distribution_adoptions_delete_moves_catalog_version AFTER DELETE ON distribution_adoptions BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;

CREATE TRIGGER distribution_favorites_insert_moves_catalog_version AFTER INSERT ON distribution_favorites BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER distribution_favorites_update_moves_catalog_version AFTER UPDATE ON distribution_favorites BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
CREATE TRIGGER distribution_favorites_delete_moves_catalog_version AFTER DELETE ON distribution_favorites BEGIN UPDATE catalog_version SET version = lower(hex(randomblob(16))); END;
