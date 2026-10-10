import type { ApiError } from "../domain/errors"
import { Err, Ok, type Result } from "../domain/result"
import type { TargetType } from "../domain/tagging"
import { type Database, execute, firstRow, unexpected } from "../infrastructure/database"
import type { Effects } from "../infrastructure/effects"
import type { UserId } from "./users"

export const createTag = async (database: Database, effects: Effects, user: UserId, name: string): Promise<Result<string, ApiError>> => {
  const id = effects.newId()
  const done = await execute(database.prepare("INSERT INTO tags (id, name, created_by, created_at) VALUES (?1, ?2, ?3, ?4)").bind(id, name, user, effects.now()))
  if (done.ok) return Ok(id)
  return Err(done.error.type === "unique" ? { type: "conflict", what: "tag-name" } : unexpected(done.error))
}

export const tagExists = async (database: Database, id: string): Promise<Result<boolean, ApiError>> => {
  const found = await firstRow<{ id: string }>(database.prepare("SELECT id FROM tags WHERE id = ?1").bind(id))
  return found.ok ? Ok(found.value !== undefined) : Err(unexpected(found.error))
}

/** The table each kind of tag target lives in. The only place a target type meets SQL. */
const TARGET_TABLES: Readonly<Record<TargetType, string>> = { machine: "machines", formula: "formulas", distribution: "distributions" }

/**
 * Whether a tag target exists. The database cannot check a polymorphic
 * reference, so every tagging is checked here before it is written.
 */
export const targetExists = async (database: Database, type: TargetType, id: string): Promise<Result<boolean, ApiError>> => {
  const found = await firstRow<{ id: string }>(database.prepare(`SELECT id FROM ${TARGET_TABLES[type]} WHERE id = ?1`).bind(id))
  return found.ok ? Ok(found.value !== undefined) : Err(unexpected(found.error))
}

export const createTagging = async (
  database: Database,
  effects: Effects,
  user: UserId,
  tagging: { readonly tagId: string; readonly targetType: TargetType; readonly targetId: string },
): Promise<Result<string, ApiError>> => {
  const id = effects.newId()
  const done = await execute(
    database
      .prepare("INSERT INTO taggings (id, tag_id, target_type, target_id, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(id, tagging.tagId, tagging.targetType, tagging.targetId, user, effects.now()),
  )
  if (done.ok) return Ok(id)
  return Err(done.error.type === "unique" ? { type: "conflict", what: "tagging" } : unexpected(done.error))
}

/** Remove a tagging its maker put on; somebody else's is not found. */
export const deleteTagging = async (database: Database, user: UserId, id: string): Promise<Result<void, ApiError>> => {
  const found = await firstRow<{ id: string }>(database.prepare("SELECT id FROM taggings WHERE id = ?1 AND created_by = ?2").bind(id, user))
  if (!found.ok) return Err(unexpected(found.error))
  if (found.value === undefined) return Err({ type: "not-found", what: "tagging" })
  const done = await execute(database.prepare("DELETE FROM taggings WHERE id = ?1").bind(id))
  return done.ok ? Ok(undefined) : Err(unexpected(done.error))
}
