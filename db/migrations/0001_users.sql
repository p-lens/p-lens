-- Who writes to the shared catalog.
--
-- There is no login. Whoever writes is a device, known by a UUIDv7 the device
-- made for itself; `users` records it so every mark has someone behind it.
-- Every id in the catalog is a UUIDv7 in canonical text form; times are
-- ISO 8601 in UTC. D1 enforces the foreign keys.

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  external_subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (provider, external_subject)
);
