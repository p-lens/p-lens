import type { ApiError } from "../domain/errors"
import { Err, Ok, type Result } from "../domain/result"
import type { Identity } from "../infrastructure/auth"
import { type Database, execute, firstRow, unexpected } from "../infrastructure/database"
import type { Effects } from "../infrastructure/effects"

export type UserId = string & { readonly __entity: "User" }

/** The internal id of a device that has written before; none for one that has not, and none is made. */
export const knownUser = async (database: Database, identity: Identity): Promise<Result<UserId | undefined, ApiError>> => {
  const found = await firstRow<{ id: string }>(database.prepare("SELECT id FROM users WHERE provider = ?1 AND external_subject = ?2").bind(identity.provider, identity.subject))
  return found.ok ? Ok(found.value?.id as UserId | undefined) : Err(unexpected(found.error))
}

/**
 * The internal id of the device asking, made on its first write. The device's
 * own id is kept as `external_subject` and never used as the user's id.
 */
export const userFor = async (database: Database, effects: Effects, identity: Identity): Promise<Result<UserId, ApiError>> => {
  const inserted = await execute(
    database
      .prepare(
        "INSERT INTO users (id, provider, external_subject, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (provider, external_subject) DO NOTHING",
      )
      .bind(effects.newId(), identity.provider, identity.subject, effects.now()),
  )
  if (!inserted.ok) return Err(unexpected(inserted.error))
  const found = await firstRow<{ id: string }>(
    database.prepare("SELECT id FROM users WHERE provider = ?1 AND external_subject = ?2").bind(identity.provider, identity.subject),
  )
  if (!found.ok) return Err(unexpected(found.error))
  return found.value === undefined ? Err({ type: "storage", detail: "user vanished after insert" }) : Ok(found.value.id as UserId)
}
