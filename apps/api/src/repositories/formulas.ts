import type { CreatedDto, StandingDto } from "@p-lens/contracts"
import type * as PachinkoContract from "@p-lens/contracts/pachinko"
import type * as PachislotContract from "@p-lens/contracts/pachislot"

import type { ApiError } from "../domain/errors"
import { Err, Ok, type Result } from "../domain/result"
import type { StoredFormula } from "../domain/stored-formula"
import { type Database, execute, executeAll, firstRow, type Statement, unexpected } from "../infrastructure/database"
import type { Effects } from "../infrastructure/effects"
import type { UserId } from "./users"

/**
 * A mark someone puts on a formula or a 設定配分: adopting or rejecting it,
 * finding its basis holds (verification) or does not (refutation), keeping
 * it handy. A rejection and a refutation count against what they are on.
 */
export type Mark = "adoption" | "rejection" | "verification" | "refutation" | "favorite"

/** What a mark or a use is on: a formula, or a 設定配分. */
export type MarkTarget = "formula" | "distribution"

const json = (value: unknown): string | null => (value === undefined ? null : JSON.stringify(value))

/** The statement that stores a formula, for running alone or in a batch with its machine. */
export const insertFormula = async (database: Database, effects: Effects, user: UserId, id: string, machineId: string, formula: StoredFormula): Promise<Statement> =>
  database
    .prepare(
      `INSERT INTO formulas (id, machine_id, kind, figures_json, basis_json, normalized_spec_json, engine_schema_version,
         sampling_json, derived_from, content_hash, created_by, created_at, bonuses_json, checked)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    )
    .bind(
      id,
      machineId,
      formula.kind,
      JSON.stringify(formula.figures),
      json(formula.basis),
      json(formula.normalized),
      formula.engineSchemaVersion ?? null,
      null,
      formula.derivedFrom ?? null,
      await effects.contentHash({ figures: formula.figures, basis: formula.basis, normalized: formula.normalized, ...(formula.bonuses === undefined ? {} : { bonuses: formula.bonuses }) }),
      user,
      effects.now(),
      json(formula.bonuses),
      formula.checked ? 1 : 0,
    )

export const addFormula = async (database: Database, effects: Effects, user: UserId, machineId: string, formula: StoredFormula): Promise<Result<CreatedDto, ApiError>> => {
  const id = effects.newId()
  const inserted = await execute(await insertFormula(database, effects, user, id, machineId, formula))
  return inserted.ok ? Ok({ id }) : Err(unexpected(inserted.error))
}

export interface StandingRow {
  readonly verifications: number
  readonly refutations: number
  readonly adoptions: number
  readonly rejections: number
  readonly favorites: number
  readonly uses: number
}

export const standingOf = (row: StandingRow): StandingDto => ({
  verifications: row.verifications,
  refutations: row.refutations,
  adoptions: row.adoptions,
  rejections: row.rejections,
  favorites: row.favorites,
  uses: row.uses,
})

export interface FormulaRow extends StandingRow {
  readonly id: string
  readonly machine_id: string
  readonly kind: "manual" | "simulated" | "sampled"
  readonly figures_json: string
  readonly basis_json: string | null
  readonly normalized_spec_json: string | null
  readonly engine_schema_version: number | null
  readonly sampling_json: string | null
  readonly bonuses_json: string | null
  readonly derived_from: string | null
  readonly content_hash: string
  readonly created_at: string
  readonly checked: number
}

/** A stored formula as served, in its machine's game's shape; SQL's nulls stop here, and absent fields are left out. */
export const formulaOf = <F extends PachinkoContract.FormulaDto | PachislotContract.FormulaDto>(row: FormulaRow): F =>
  ({
    id: row.id,
    machineId: row.machine_id,
    kind: row.kind,
    figures: JSON.parse(row.figures_json),
    ...(row.basis_json === null || row.normalized_spec_json === null || row.engine_schema_version === null
      ? {}
      : { basis: { ...JSON.parse(row.basis_json), normalized: JSON.parse(row.normalized_spec_json), engineSchemaVersion: row.engine_schema_version } }),
    ...(row.sampling_json === null ? {} : { sampling: JSON.parse(row.sampling_json) }),
    ...(row.derived_from === null ? {} : { derivedFrom: row.derived_from }),
    ...(row.checked === 0 ? { unchecked: true } : {}),
    contentHash: row.content_hash,
    createdAt: row.created_at,
    standing: standingOf(row),
  }) as F

/** A stored pachinko formula as served: with its bonuses, none for one stored before a formula stated any and whose machine listed none. */
export const pachinkoFormulaOf = (row: FormulaRow): PachinkoContract.FormulaDto => ({
  ...formulaOf<PachinkoContract.FormulaDto>(row),
  bonuses: row.bonuses_json === null ? [] : (JSON.parse(row.bonuses_json) as PachinkoContract.FormulaDto["bonuses"]),
})

export const FORMULA_STANDING = `
  (SELECT COUNT(*) FROM formula_verifications v WHERE v.formula_id = f.id AND v.verdict = 1) AS verifications,
  (SELECT COUNT(*) FROM formula_verifications v WHERE v.formula_id = f.id AND v.verdict = -1) AS refutations,
  (SELECT COUNT(*) FROM formula_adoptions a WHERE a.formula_id = f.id) AS adoptions,
  (SELECT COUNT(*) FROM formula_rejections r WHERE r.formula_id = f.id) AS rejections,
  (SELECT COUNT(*) FROM formula_favorites p WHERE p.formula_id = f.id) AS favorites,
  (SELECT COUNT(*) FROM formula_uses u WHERE u.formula_id = f.id) AS uses`

/** The table each target is kept in, and the column its marks and uses name it by. The only place a target meets SQL. */
const TARGETS: Readonly<Record<MarkTarget, { readonly table: string; readonly column: string }>> = {
  formula: { table: "formulas", column: "formula_id" },
  distribution: { table: "distributions", column: "distribution_id" },
}

interface TargetHead {
  readonly machineId: string
  readonly kind: FormulaRow["kind"] | undefined
}

const readTargetHead = async (database: Database, target: MarkTarget, id: string): Promise<Result<TargetHead, ApiError>> => {
  const found = await firstRow<{ machine_id: string; kind: FormulaRow["kind"] | null }>(
    database
      .prepare(
        `SELECT t.machine_id, ${target === "formula" ? "t.kind" : "NULL AS kind"} FROM ${TARGETS[target].table} t JOIN machines m ON m.id = t.machine_id
         WHERE t.id = ?1 AND t.hidden_at IS NULL AND m.hidden_at IS NULL`,
      )
      .bind(id),
  )
  if (!found.ok) return Err(unexpected(found.error))
  if (found.value === undefined) return Err({ type: "not-found", what: target })
  return Ok({ machineId: found.value.machine_id, kind: found.value.kind ?? undefined })
}

const VERDICTS: Readonly<Partial<Record<Mark, number>>> = { verification: 1, refutation: -1 }

/** Whether a mark can be put on a target at all: a 設定配分 is only adopted and favoured. */
const markable = (target: MarkTarget, mark: Mark): boolean => target === "formula" || mark === "adoption" || mark === "favorite"

/**
 * The statements that set a mark: an adoption replaces the person's adoption
 * of the same kind on the same machine; a verdict is the person's one of its
 * sense on this formula, and given again is nothing new. No mark lets go of
 * another: a person may adopt a formula and reject it, find its basis good
 * and find it wanting, and the two count against each other.
 */
const setStatements = (database: Database, effects: Effects, user: UserId, target: MarkTarget, id: string, head: TargetHead, mark: Mark): readonly Statement[] => {
  const column = TARGETS[target].column
  switch (mark) {
    case "adoption":
      return [
        database
          .prepare(
            `INSERT INTO ${target}_adoptions (id, user_id, machine_id, ${column}, adopted_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (user_id, machine_id) DO UPDATE SET ${column} = excluded.${column}, adopted_at = excluded.adopted_at`,
          )
          .bind(effects.newId(), user, head.machineId, id, effects.now()),
      ]
    case "rejection":
      return [
        database
          .prepare("INSERT INTO formula_rejections (id, user_id, formula_id, rejected_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (user_id, formula_id) DO NOTHING")
          .bind(effects.newId(), user, id, effects.now()),
      ]
    case "verification":
    case "refutation":
      return [
        database
          .prepare(
            `INSERT INTO formula_verifications (id, user_id, formula_id, verdict, verified_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (user_id, formula_id, verdict) DO NOTHING`,
          )
          .bind(effects.newId(), user, id, VERDICTS[mark], effects.now()),
      ]
    case "favorite":
      return [
        database
          .prepare(`INSERT INTO ${target}_favorites (id, user_id, ${column}, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (user_id, ${column}) DO NOTHING`)
          .bind(effects.newId(), user, id, effects.now()),
      ]
  }
}

/** The statement that clears a mark, and only that mark. A verdict is never cleared: `setMark` refuses it first. */
const clearStatement = (database: Database, user: UserId, target: MarkTarget, id: string, mark: Exclude<Mark, "verification" | "refutation">): Statement => {
  const column = TARGETS[target].column
  switch (mark) {
    case "adoption":
      return database.prepare(`DELETE FROM ${target}_adoptions WHERE user_id = ?1 AND ${column} = ?2`).bind(user, id)
    case "rejection":
      return database.prepare("DELETE FROM formula_rejections WHERE user_id = ?1 AND formula_id = ?2").bind(user, id)
    case "favorite":
      return database.prepare(`DELETE FROM ${target}_favorites WHERE user_id = ?1 AND ${column} = ?2`).bind(user, id)
  }
}

/**
 * Set or clear a device's mark on a formula or a 設定配分. Only a formula
 * worked out from a basis — simulated or sampled — can be verified or
 * refuted; one typed in has nothing to have checked. A verdict given
 * stands: it is not cleared, only answered with the other. A 設定配分 is
 * only adopted and favoured.
 */
export const setMark = async (
  database: Database,
  effects: Effects,
  user: UserId,
  target: MarkTarget,
  id: string,
  mark: Mark,
  on: boolean,
): Promise<Result<void, ApiError>> => {
  const head = await readTargetHead(database, target, id)
  if (!head.ok) return head
  if (!markable(target, mark)) return Err({ type: "not-markable", mark })
  if (mark === "verification" || mark === "refutation") {
    if (!on) return Err({ type: "check-stands" })
    if (head.value.kind === "manual") return Err({ type: "not-verifiable" })
    const checked = await executeAll(database, setStatements(database, effects, user, target, id, head.value, mark))
    return checked.ok ? Ok(undefined) : Err(unexpected(checked.error))
  }
  const done = await executeAll(database, on ? setStatements(database, effects, user, target, id, head.value, mark) : [clearStatement(database, user, target, id, mark)])
  return done.ok ? Ok(undefined) : Err(unexpected(done.error))
}

export const recordUse = async (database: Database, effects: Effects, user: UserId, target: MarkTarget, id: string): Promise<Result<void, ApiError>> => {
  const head = await readTargetHead(database, target, id)
  if (!head.ok) return head
  const done = await execute(
    database.prepare(`INSERT INTO ${target}_uses (id, user_id, ${TARGETS[target].column}, used_at) VALUES (?1, ?2, ?3, ?4)`).bind(effects.newId(), user, id, effects.now()),
  )
  return done.ok ? Ok(undefined) : Err(unexpected(done.error))
}
