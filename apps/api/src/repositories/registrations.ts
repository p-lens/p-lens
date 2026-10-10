import type { ApiError } from "../domain/errors"
import { dayBefore, type RegistrationKind } from "../domain/quota"
import { Err, Ok, type Result } from "../domain/result"
import { allRows, type Database, executeAll, unexpected } from "../infrastructure/database"
import type { Effects } from "../infrastructure/effects"
import type { UserId } from "./users"

/** When a device, and its address, registered something of a kind within the last day. */
export interface Registered {
  readonly mine: readonly string[]
  readonly fromAddress: readonly string[]
}

const stampsOf = async (database: Database, column: "user_id" | "address_hash", value: string | undefined, kind: RegistrationKind, since: string): Promise<Result<readonly string[], ApiError>> => {
  if (value === undefined) return Ok([])
  const rows = await allRows<{ created_at: string }>(database.prepare(`SELECT created_at FROM registrations WHERE ${column} = ?1 AND kind = ?2 AND created_at > ?3`).bind(value, kind, since))
  return rows.ok ? Ok(rows.value.map((row) => row.created_at)) : Err(unexpected(rows.error))
}

/** What a device and its address registered of a kind within the day before `now`. A device not seen yet, or an address not known, registered nothing. */
export const registeredLately = async (database: Database, kind: RegistrationKind, user: UserId | undefined, addressHash: string | undefined, now: string): Promise<Result<Registered, ApiError>> => {
  const since = dayBefore(now)
  const mine = await stampsOf(database, "user_id", user, kind, since)
  if (!mine.ok) return mine
  const fromAddress = await stampsOf(database, "address_hash", addressHash, kind, since)
  return fromAddress.ok ? Ok({ mine: mine.value, fromAddress: fromAddress.value }) : fromAddress
}

/** A registration entered in the ledger, and what is older than a day taken out of it: nothing is kept past what a quota counts. */
export const recordRegistration = async (database: Database, effects: Effects, kind: RegistrationKind, user: UserId, addressHash: string | undefined): Promise<Result<void, ApiError>> => {
  const now = effects.now()
  const done = await executeAll(database, [
    database.prepare("DELETE FROM registrations WHERE created_at <= ?1").bind(dayBefore(now)),
    database.prepare("INSERT INTO registrations (id, kind, user_id, address_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(effects.newId(), kind, user, addressHash ?? null, now),
  ])
  return done.ok ? Ok(undefined) : Err(unexpected(done.error))
}
