import type { ApiError } from "../domain/errors"
import { Err, Ok, type Result } from "../domain/result"
import { allRows, type Database, execute, executeAll, firstRow, unexpected } from "../infrastructure/database"
import type { Effects } from "../infrastructure/effects"

/** What an administrator can hide: anything people register, never a mark. */
export type HiddenTarget = "machine" | "formula" | "distribution"

export const HIDDEN_TARGETS: readonly HiddenTarget[] = ["machine", "formula", "distribution"]

const TABLES: Readonly<Record<HiddenTarget, string>> = { machine: "machines", formula: "formulas", distribution: "distributions" }

/** Something registered, as an administrator reviews it: what, by which device, when, and whether it is hidden. */
export interface Registered {
  readonly target: HiddenTarget
  readonly id: string
  readonly machineId: string
  /** The machine's name, or a 設定配分's label; a formula is told by its machine's. */
  readonly name: string
  readonly device: string
  readonly createdAt: string
  readonly hiddenAt: string | undefined
  readonly hiddenReason: string | undefined
}

interface RegisteredRow {
  readonly target: HiddenTarget
  readonly id: string
  readonly machine_id: string
  readonly name: string
  readonly device: string
  readonly created_at: string
  readonly hidden_at: string | null
  readonly hidden_reason: string | null
}

const registeredOf = (row: RegisteredRow): Registered => ({
  target: row.target,
  id: row.id,
  machineId: row.machine_id,
  name: row.name,
  device: row.device,
  createdAt: row.created_at,
  hiddenAt: row.hidden_at ?? undefined,
  hiddenReason: row.hidden_reason ?? undefined,
})

/** Everything registered, newest first, hidden or not, for an administrator to look over. */
export const recentlyRegistered = async (database: Database, limit: number): Promise<Result<readonly Registered[], ApiError>> => {
  const rows = await allRows<RegisteredRow>(
    database
      .prepare(
        `SELECT 'machine' AS target, m.id AS id, m.id AS machine_id, m.name AS name, u.external_subject AS device, m.created_at AS created_at, m.hidden_at AS hidden_at, m.hidden_reason AS hidden_reason
           FROM machines m JOIN users u ON u.id = m.created_by
         UNION ALL
         SELECT 'formula', f.id, f.machine_id, m.name, u.external_subject, f.created_at, f.hidden_at, f.hidden_reason
           FROM formulas f JOIN machines m ON m.id = f.machine_id JOIN users u ON u.id = f.created_by
         UNION ALL
         SELECT 'distribution', d.id, d.machine_id, d.label, u.external_subject, d.created_at, d.hidden_at, d.hidden_reason
           FROM distributions d JOIN users u ON u.id = d.created_by
         ORDER BY created_at DESC LIMIT ?1`,
      )
      .bind(limit),
  )
  return rows.ok ? Ok(rows.value.map(registeredOf)) : Err(unexpected(rows.error))
}

/**
 * Hide one thing registered, saying why, or show it again. Nothing is
 * deleted. A machine shown again whose name has since been registered by
 * another is a conflict: hide that one first.
 */
export const setHidden = async (
  database: Database,
  effects: Effects,
  target: HiddenTarget,
  id: string,
  reason: string | undefined,
  hidden: boolean,
): Promise<Result<void, ApiError>> => {
  const found = await firstRow<{ id: string }>(database.prepare(`SELECT id FROM ${TABLES[target]} WHERE id = ?1`).bind(id))
  if (!found.ok) return Err(unexpected(found.error))
  if (found.value === undefined) return Err({ type: "not-found", what: target })
  const done = await execute(
    database
      .prepare(`UPDATE ${TABLES[target]} SET hidden_at = ?2, hidden_reason = ?3 WHERE id = ?1`)
      .bind(id, hidden ? effects.now() : null, hidden ? (reason ?? null) : null),
  )
  if (done.ok) return Ok(undefined)
  return Err(done.error.type === "unique" ? { type: "conflict", what: "machine-name" } : unexpected(done.error))
}

/** How much hiding a device's registrations hid. */
export interface HiddenCounts {
  readonly machines: number
  readonly formulas: number
  readonly distributions: number
}

/** Everything one device registered and is still shown, hidden at once: a vandal's spree cleared in one go. */
export const hideAllBy = async (database: Database, effects: Effects, device: string, reason: string | undefined): Promise<Result<HiddenCounts, ApiError>> => {
  const counted = await firstRow<HiddenCounts>(
    database
      .prepare(
        `SELECT (SELECT COUNT(*) FROM machines t JOIN users u ON u.id = t.created_by WHERE u.external_subject = ?1 AND t.hidden_at IS NULL) AS machines,
                (SELECT COUNT(*) FROM formulas t JOIN users u ON u.id = t.created_by WHERE u.external_subject = ?1 AND t.hidden_at IS NULL) AS formulas,
                (SELECT COUNT(*) FROM distributions t JOIN users u ON u.id = t.created_by WHERE u.external_subject = ?1 AND t.hidden_at IS NULL) AS distributions`,
      )
      .bind(device),
  )
  if (!counted.ok) return Err(unexpected(counted.error))
  const now = effects.now()
  const done = await executeAll(
    database,
    HIDDEN_TARGETS.map((target) =>
      database
        .prepare(
          `UPDATE ${TABLES[target]} SET hidden_at = ?2, hidden_reason = ?3
           WHERE hidden_at IS NULL AND created_by IN (SELECT id FROM users WHERE external_subject = ?1)`,
        )
        .bind(device, now, reason ?? null),
    ),
  )
  return done.ok ? Ok(counted.value ?? { machines: 0, formulas: 0, distributions: 0 }) : Err(unexpected(done.error))
}
