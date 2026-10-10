import { comparableName, type GameKindDto, type MachineDetailDto, type MachineSummaryDto, type RegisteredDto } from "@p-lens/contracts"
import type * as PachislotContract from "@p-lens/contracts/pachislot"

import type { ApiError } from "../domain/errors"
import { Err, Ok, type Result } from "../domain/result"
import type { StoredFormula } from "../domain/stored-formula"
import { allRows, type Database, execute, executeAll, firstRow, unexpected } from "../infrastructure/database"
import type { Effects } from "../infrastructure/effects"
import { DISTRIBUTION_STANDING, type DistributionRow, distributionOf } from "./pachislot/distributions"
import { FORMULA_STANDING, type FormulaRow, formulaOf, insertFormula, pachinkoFormulaOf } from "./formulas"
import type { UserId } from "./users"

interface MachineRow {
  readonly id: string
  readonly game_kind: GameKindDto
  readonly name: string
  readonly model_name: string | null
  readonly hit_chance: string | null
  /** The words it is searched by, in the order given, as a JSON list. */
  readonly keywords: string
  readonly released_on: string
  readonly formula_count: number
}

const summaryOf = (row: MachineRow): MachineSummaryDto => ({
  id: row.id,
  gameKind: row.game_kind,
  name: row.name,
  ...(row.model_name === null ? {} : { modelName: row.model_name }),
  keywords: JSON.parse(row.keywords) as readonly string[],
  ...(row.hit_chance === null ? {} : { hitChance: row.hit_chance }),
  releasedOn: row.released_on,
  formulaCount: row.formula_count,
})

/** How a machine is described as it is written down: by everything but its game, its date and who registered it. */
export interface MachineDescription {
  readonly name: string
  readonly modelName: string | undefined
  readonly keywords: readonly string[]
  readonly hitChance: string | undefined
}

/** A search term as a LIKE pattern that matches it anywhere, its own `%` and `_` taken literally. */
const containing = (term: string): string => `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`

const FORMULA_COUNT = "(SELECT COUNT(*) FROM formulas f WHERE f.machine_id = m.id AND f.hidden_at IS NULL) AS formula_count"

const KEYWORDS = "(SELECT json_group_array(keyword) FROM (SELECT k.keyword FROM machine_keywords k WHERE k.machine_id = m.id ORDER BY k.position)) AS keywords"

/** Everything a machine is read by. */
const MACHINE = `m.id, m.game_kind, m.name, m.model_name, m.hit_chance, ${KEYWORDS}, m.released_on, ${FORMULA_COUNT}`

const keywordInserts = (database: Database, machineId: string, keywords: readonly string[], now: string): readonly ReturnType<Database["prepare"]>[] =>
  keywords.map((keyword, position) =>
    database.prepare("INSERT INTO machine_keywords (machine_id, position, keyword, comparable_keyword, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(machineId, position, keyword, comparableName(keyword), now),
  )

/**
 * Machines whose name or model name, as compared, or any word they are
 * searched by contains the term, newest release first; of one game, where
 * one is asked for. SQLite's own LIKE, no
 * outside service. A hidden machine, and anything hidden, is never found,
 * read or delivered here.
 */
export const searchMachines = async (database: Database, term: string, gameKind: GameKindDto | undefined): Promise<Result<readonly MachineSummaryDto[], ApiError>> => {
  const wanted = comparableName(term)
  const rows = await allRows<MachineRow>(
    database
      .prepare(
        `SELECT ${MACHINE} FROM machines m
         WHERE m.hidden_at IS NULL AND (?3 IS NULL OR m.game_kind = ?3)
           AND (?1 = '' OR m.comparable_name LIKE ?2 ESCAPE '\\' OR LOWER(IFNULL(m.model_name, '')) LIKE ?2 ESCAPE '\\'
                OR EXISTS (SELECT 1 FROM machine_keywords k WHERE k.machine_id = m.id AND k.comparable_keyword LIKE ?2 ESCAPE '\\'))
         ORDER BY m.released_on DESC, m.created_at DESC, m.id DESC LIMIT 50`,
      )
      .bind(wanted, containing(wanted), gameKind ?? null),
  )
  return rows.ok ? Ok(rows.value.map(summaryOf)) : Err(unexpected(rows.error))
}

/** The game a machine is, or none where there is no such machine. */
export const gameOfMachine = async (database: Database, id: string): Promise<Result<GameKindDto | undefined, ApiError>> => {
  const found = await firstRow<{ game_kind: GameKindDto }>(database.prepare("SELECT game_kind FROM machines WHERE id = ?1 AND hidden_at IS NULL").bind(id))
  return found.ok ? Ok(found.value?.game_kind) : Err(unexpected(found.error))
}

/**
 * Whether a model name is another machine's already, as compared: a model
 * name is one machine's, of whichever game, since it is the name a machine
 * goes into a book under. A hidden machine lets its model name go as it
 * does its name. Asked before a machine is written; two registered in the
 * same instant are not told apart here.
 */
const modelNameTaken = async (database: Database, modelName: string | undefined, but: string | undefined): Promise<Result<boolean, ApiError>> => {
  if (modelName === undefined) return Ok(false)
  const found = await firstRow<{ id: string }>(
    database.prepare("SELECT id FROM machines WHERE hidden_at IS NULL AND LOWER(model_name) = ?1 AND (?2 IS NULL OR id <> ?2) LIMIT 1").bind(comparableName(modelName), but ?? null),
  )
  return found.ok ? Ok(found.value !== undefined) : Err(unexpected(found.error))
}

/**
 * A machine and its first formula, written as one batch: both or neither, so
 * the catalog never holds a machine without a formula. A name already taken
 * by a machine of the same game, as compared, is a conflict, and so is a
 * model name already taken by any machine.
 */
export const registerMachine = async (
  database: Database,
  effects: Effects,
  user: UserId,
  machine: MachineDescription & { readonly gameKind: GameKindDto; readonly releasedOn: string },
  formula: StoredFormula,
): Promise<Result<RegisteredDto, ApiError>> => {
  const taken = await modelNameTaken(database, machine.modelName, undefined)
  if (!taken.ok) return taken
  if (taken.value) return Err({ type: "conflict", what: "model-name" })
  const machineId = effects.newId()
  const formulaId = effects.newId()
  const now = effects.now()
  const done = await executeAll(database, [
    database
      .prepare("INSERT INTO machines (id, game_kind, name, comparable_name, model_name, hit_chance, released_on, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
      .bind(machineId, machine.gameKind, machine.name, comparableName(machine.name), machine.modelName ?? null, machine.hitChance ?? null, machine.releasedOn, user, now),
    ...keywordInserts(database, machineId, machine.keywords, now),
    await insertFormula(database, effects, user, formulaId, machineId, formula),
  ])
  if (done.ok) return Ok({ machineId, formulaId })
  return Err(done.error.type === "unique" ? { type: "conflict", what: "machine-name" } : unexpected(done.error))
}

/**
 * Describe a machine anew: its name, its model name, its 大当り確率 and
 * the words it is searched by, all at once, as an administrator sets them
 * right.
 * Its formulas are left as they are. A name another machine of its game
 * goes by is a conflict, and so is a model name another machine has; a
 * hidden machine is described like any other.
 */
export const describeMachine = async (database: Database, effects: Effects, id: string, described: MachineDescription): Promise<Result<void, ApiError>> => {
  const found = await firstRow<{ id: string }>(database.prepare("SELECT id FROM machines WHERE id = ?1").bind(id))
  if (!found.ok) return Err(unexpected(found.error))
  if (found.value === undefined) return Err({ type: "not-found", what: "machine" })
  const taken = await modelNameTaken(database, described.modelName, id)
  if (!taken.ok) return taken
  if (taken.value) return Err({ type: "conflict", what: "model-name" })
  const now = effects.now()
  const done = await executeAll(database, [
    database
      .prepare("UPDATE machines SET name = ?2, comparable_name = ?3, model_name = ?4, hit_chance = ?5, described_at = ?6 WHERE id = ?1")
      .bind(id, described.name, comparableName(described.name), described.modelName ?? null, described.hitChance ?? null, now),
    database.prepare("DELETE FROM machine_keywords WHERE machine_id = ?1").bind(id),
    ...keywordInserts(database, id, described.keywords, now),
  ])
  if (done.ok) return Ok(undefined)
  return Err(done.error.type === "unique" ? { type: "conflict", what: "machine-name" } : unexpected(done.error))
}

/** A machine with its formulas, and a pachislot machine with its 設定配分: the game is the machine's, and decides the shape. */
const detailOf = (machine: MachineRow, formulas: readonly FormulaRow[], distributions: readonly DistributionRow[]): MachineDetailDto =>
  machine.game_kind === "pachinko"
    ? { machine: { ...summaryOf(machine), gameKind: "pachinko" }, formulas: formulas.map(pachinkoFormulaOf) }
    : {
        machine: { ...summaryOf(machine), gameKind: "pachislot" },
        formulas: formulas.map((row) => formulaOf<PachislotContract.FormulaDto>(row)),
        distributions: distributions.map(distributionOf),
      }

/** A machine, every formula of it and every 設定配分, each with what people have done with it. Ranking is the reader's. */
export const readMachine = async (database: Database, id: string): Promise<Result<MachineDetailDto, ApiError>> => {
  const machine = await firstRow<MachineRow>(database.prepare(`SELECT ${MACHINE} FROM machines m WHERE m.id = ?1 AND m.hidden_at IS NULL`).bind(id))
  if (!machine.ok) return Err(unexpected(machine.error))
  if (machine.value === undefined) return Err({ type: "not-found", what: "machine" })
  const formulas = await allRows<FormulaRow>(database.prepare(`SELECT f.*, ${FORMULA_STANDING} FROM formulas f WHERE f.machine_id = ?1 AND f.hidden_at IS NULL ORDER BY f.created_at`).bind(id))
  if (!formulas.ok) return Err(unexpected(formulas.error))
  const distributions = await allRows<DistributionRow>(
    database.prepare(`SELECT d.*, ${DISTRIBUTION_STANDING} FROM distributions d WHERE d.machine_id = ?1 AND d.hidden_at IS NULL ORDER BY d.created_at`).bind(id),
  )
  if (!distributions.ok) return Err(unexpected(distributions.error))
  return Ok(detailOf(machine.value, formulas.value, distributions.value))
}

/**
 * The shape the catalog's stored things are kept in, said in the catalog's
 * version: raised when a migration rewrites what is stored where it lies,
 * which no count or time in the tables shows, so that every device takes
 * the catalog again. `stated-rates-typed`: a pachislot formula whose 機械割
 * was stated is told it was typed in.
 */
const STORED_SHAPE = "stated-rates-typed"

/** What changes the catalog a device holds: each table's rows and its latest write, uses aside — a statistic, never worth a delivery of its own — what is hidden, and what was described anew. */
const VERSION_FINGERPRINT = [
  ["machines", "created_at"],
  ["machine_keywords", "created_at"],
  ["formulas", "created_at"],
  ["distributions", "created_at"],
  ["formula_adoptions", "adopted_at"],
  ["formula_rejections", "rejected_at"],
  ["formula_verifications", "verified_at"],
  ["formula_favorites", "created_at"],
  ["distribution_adoptions", "adopted_at"],
  ["distribution_favorites", "created_at"],
]
  .map(([table, time]) => `(SELECT COUNT(*) || ':' || IFNULL(MAX(${time}), '') FROM ${table})`)
  .concat(["machines", "formulas", "distributions"].map((table) => `(SELECT COUNT(hidden_at) || ':' || IFNULL(MAX(hidden_at), '') FROM ${table})`))
  .concat(["(SELECT COUNT(described_at) || ':' || IFNULL(MAX(described_at), '') FROM machines)"])
  .concat([`'${STORED_SHAPE}'`])
  .join(" || '|' || ")

/**
 * The version of the catalog: a hash of what changes it, so a device that
 * holds this version holds this catalog. Any machine, formula, 設定配分 or
 * mark written, changed or taken back gives a new one.
 */
export const catalogVersion = async (database: Database, effects: Effects): Promise<Result<string, ApiError>> => {
  const found = await firstRow<{ fingerprint: string }>(database.prepare(`SELECT ${VERSION_FINGERPRINT} AS fingerprint`))
  if (!found.ok) return Err(unexpected(found.error))
  return Ok(await effects.contentHash(found.value?.fingerprint ?? ""))
}

/** The whole catalog, every machine with all it has, newest release first; delivered whole to every device. */
export const readCatalog = async (database: Database): Promise<Result<readonly MachineDetailDto[], ApiError>> => {
  const machines = await allRows<MachineRow>(
    database.prepare(`SELECT ${MACHINE} FROM machines m WHERE m.hidden_at IS NULL ORDER BY m.released_on DESC, m.created_at DESC, m.id DESC`),
  )
  if (!machines.ok) return Err(unexpected(machines.error))
  const formulas = await allRows<FormulaRow>(database.prepare(`SELECT f.*, ${FORMULA_STANDING} FROM formulas f WHERE f.hidden_at IS NULL ORDER BY f.created_at`))
  if (!formulas.ok) return Err(unexpected(formulas.error))
  const distributions = await allRows<DistributionRow>(database.prepare(`SELECT d.*, ${DISTRIBUTION_STANDING} FROM distributions d WHERE d.hidden_at IS NULL ORDER BY d.created_at`))
  if (!distributions.ok) return Err(unexpected(distributions.error))
  return Ok(
    machines.value.map((machine) =>
      detailOf(
        machine,
        formulas.value.filter((row) => row.machine_id === machine.id),
        distributions.value.filter((row) => row.machine_id === machine.id),
      ),
    ),
  )
}

export const favoriteMachine = async (database: Database, effects: Effects, user: UserId, machineId: string, on: boolean): Promise<Result<void, ApiError>> => {
  const done = await execute(
    on
      ? database
          .prepare("INSERT INTO machine_favorites (id, user_id, machine_id, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (user_id, machine_id) DO NOTHING")
          .bind(effects.newId(), user, machineId, effects.now())
      : database.prepare("DELETE FROM machine_favorites WHERE user_id = ?1 AND machine_id = ?2").bind(user, machineId),
  )
  return done.ok ? Ok(undefined) : Err(unexpected(done.error))
}
