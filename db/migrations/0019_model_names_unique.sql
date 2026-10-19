-- A model name is one machine's, of whichever game, as compared: it is the
-- name a machine goes into a book under, so two machines that share it
-- could not be told apart there. The API asked before writing; two
-- registered in the same instant got past that. The model name as compared
-- is now kept beside it and held unique, a hidden machine letting its own
-- go as it does its name.
--
-- A model name is stored as it is kept (width folded, spaces collapsed), so
-- folding its case here is all that comparing it does to what is stored.

ALTER TABLE machines ADD COLUMN comparable_model_name TEXT;

UPDATE machines SET comparable_model_name = LOWER(model_name) WHERE model_name IS NOT NULL;

CREATE UNIQUE INDEX machines_by_model_name ON machines (comparable_model_name) WHERE hidden_at IS NULL AND comparable_model_name IS NOT NULL;
