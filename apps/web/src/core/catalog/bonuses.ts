import { comparableName, MACHINE_BONUSES } from "@p-lens/contracts"

import { Err, Ok, type Result } from "../result/result"
import { tidyTyped } from "../text/tidy"
import type { MachineBonus } from "./catalog"

/** A bonus as typed into its row of a machine's bonuses, each still text. */
export interface BonusRow {
  readonly name: string
  readonly payout: string
  readonly spent: string
}

export type BonusField = keyof BonusRow

export const EMPTY_BONUS_ROW: BonusRow = { name: "", payout: "", spent: "" }

/**
 * What a row of bonuses, as typed, is wrong with: which row, which field.
 *
 * - `repeated`: another row above already has the name.
 * - `not-a-count`: not a whole number, or below what the field takes.
 * - `too-large`: more than the catalog takes a bonus to pay out.
 * - `not-below-payout`: as much is spent as is paid out, so nothing is won.
 */
export type BonusProblem =
  | { readonly type: "missing"; readonly row: number; readonly field: BonusField }
  | { readonly type: "name-too-long"; readonly row: number; readonly field: "name"; readonly longest: number }
  | { readonly type: "repeated"; readonly row: number; readonly field: "name" }
  | { readonly type: "not-a-count"; readonly row: number; readonly field: "payout" | "spent" }
  | { readonly type: "too-large"; readonly row: number; readonly field: "payout"; readonly most: number }
  | { readonly type: "not-below-payout"; readonly row: number; readonly field: "spent" }

const COUNT = /^\d+$/

const countOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return COUNT.test(plain) ? Number(plain) : undefined
}

const blank = (row: BonusRow): boolean => row.name.trim() === "" && tidyTyped(row.payout) === "" && tidyTyped(row.spent) === ""

const nameProblem = (rows: readonly BonusRow[], row: number, name: string): BonusProblem | undefined => {
  if (name === "") return { type: "missing", row, field: "name" }
  if ([...name].length > MACHINE_BONUSES.nameLength) return { type: "name-too-long", row, field: "name", longest: MACHINE_BONUSES.nameLength }
  const first = rows.findIndex((other) => comparableName(other.name.trim()) === comparableName(name))
  return first < row ? { type: "repeated", row, field: "name" } : undefined
}

const payoutProblem = (row: number, typed: string): BonusProblem | undefined => {
  if (tidyTyped(typed) === "") return { type: "missing", row, field: "payout" }
  const payout = countOf(typed)
  if (payout === undefined || payout === 0) return { type: "not-a-count", row, field: "payout" }
  return payout > MACHINE_BONUSES.payout ? { type: "too-large", row, field: "payout", most: MACHINE_BONUSES.payout } : undefined
}

/** What is spent is none where none is typed: a bonus's payout is then all won. */
const spentOf = (typed: string): number | undefined => (tidyTyped(typed) === "" ? 0 : countOf(typed))

const spentProblem = (row: number, typed: string, payout: number | undefined): BonusProblem | undefined => {
  const spent = spentOf(typed)
  if (spent === undefined) return { type: "not-a-count", row, field: "spent" }
  return payout !== undefined && payout > 0 && spent >= payout ? { type: "not-below-payout", row, field: "spent" } : undefined
}

const rowProblems = (rows: readonly BonusRow[], row: number): readonly BonusProblem[] => {
  const typed = rows[row] ?? EMPTY_BONUS_ROW
  if (blank(typed)) return []
  return [nameProblem(rows, row, typed.name.trim()), payoutProblem(row, typed.payout), spentProblem(row, typed.spent, countOf(typed.payout))].filter(
    (problem): problem is BonusProblem => problem !== undefined,
  )
}

/**
 * A machine's bonuses as typed, row by row: each named, with what it pays
 * out and what is spent winning it. A row left wholly empty is no bonus,
 * and none typed is none.
 */
export const readBonuses = (rows: readonly BonusRow[]): Result<readonly MachineBonus[], readonly BonusProblem[]> => {
  const problems = rows.flatMap((_, row) => rowProblems(rows, row))
  if (problems.length > 0) return Err(problems)
  return Ok(rows.filter((row) => !blank(row)).map((row) => ({ name: row.name.trim(), payout: countOf(row.payout) ?? 0, spent: spentOf(row.spent) ?? 0 })))
}

/** Whether another bonus can be added to the rows: the catalog takes so many and no more. */
export const takesAnotherBonus = (rows: readonly BonusRow[]): boolean => rows.length < MACHINE_BONUSES.count

/** What a bonus adds to the balls in hand: what it pays out, less what is spent winning it. */
export const bonusGain = (bonus: MachineBonus): number => bonus.payout - bonus.spent
