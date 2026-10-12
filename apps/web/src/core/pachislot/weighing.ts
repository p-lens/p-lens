import type { NormalizedSpecDto, PlayDto } from "@p-lens/contracts/pachislot"

import { tokenValueOf, type PlayTerms } from "../parlor/terms"
import type { Checkpoint, Tally } from "../play-log/checkpoint"
import type { FormulaSnapshot } from "./snapshot"
import type { Prior } from "./prior"

/**
 * What a pachislot play is weighed by, carried in its draft from the moment
 * it began: the formula and the prior, as they were then.
 */
export interface Weighing {
  readonly formula: FormulaSnapshot
  readonly prior: Prior
}

/** Something a player can count at the cabinet: a small win, a replay, a bonus or a part of one, by its id and label. */
export interface Countable {
  readonly id: string
  readonly label: string
}

/** Regular games an hour at a steady pace, which 期待値/時 is worked out at. */
export const GAMES_PER_HOUR = 700

const eventsOf = (normalized: NormalizedSpecDto) => normalized.tables.at(0)?.events ?? []

/**
 * The bonus the data counter shows a counted id as: a part as the bonus it is
 * part of, a bonus as itself; nothing for a small win or a replay.
 */
export const counterBonusOf =
  (normalized: NormalizedSpecDto) =>
  (id: string): string | undefined => {
    const event = eventsOf(normalized).find((candidate) => candidate.kind.type === "bonus" && (candidate.id === id || candidate.group === id))
    return event === undefined ? undefined : (event.group ?? event.id)
  }

/** Everything a game can come to that a player can count, in the spec's order: a bonus told apart by its parts is counted part by part. */
export const countablesOf = (formula: FormulaSnapshot): readonly Countable[] =>
  eventsOf(formula.normalized).map((event) => ({ id: event.id, label: formula.labels[event.id] || event.id }))

/** The bonuses a data counter shows, as the formula names them. */
export const counterBonusesOf = (formula: FormulaSnapshot): readonly Countable[] =>
  (formula.figures.at(0)?.bonuses ?? []).map((bonus) => ({ id: bonus.id, label: bonus.label }))

/** The setting levels a formula has, as the tables the engine solves give them. */
export const settingLevelsOf = (formula: FormulaSnapshot): readonly number[] => formula.normalized.tables.map((table) => table.settingLevel)

/**
 * The play's terms as the engine weighs them: what a medal exchanges for, what
 * renting one costs, and the share of the medals played that was rented —
 * the outlay in medals over the medals played. With no outlay known, or no
 * game played yet, the share is what a machine paying back `payoutRate`
 * leaves short over a long play: `1 − payoutRate`, and none above 100%,
 * where the play runs on what it pays out. None without terms.
 */
export const playOf = (
  terms: PlayTerms | undefined,
  play: { readonly bet: number; readonly games: number; readonly outlay: number | undefined; readonly payoutRate: number },
): PlayDto | undefined => {
  if (terms === undefined) return undefined
  const played = play.games * play.bet
  const rented = play.outlay === undefined ? undefined : (play.outlay * terms.rental.tokens) / terms.rental.yen
  return {
    medalValue: tokenValueOf(terms),
    rentalPrice: terms.rental.yen / terms.rental.tokens,
    cashShare: rented === undefined || played === 0 ? Math.min(1, Math.max(0, 1 - play.payoutRate)) : Math.min(1, rented / played),
    gamesPerHour: GAMES_PER_HOUR,
  }
}

/** Every name a formula counts by: each event, the bonus a part is part of, and the bonuses a data counter shows. */
const namedBy = (formula: FormulaSnapshot): ReadonlySet<string> =>
  new Set([...eventsOf(formula.normalized).flatMap((event) => (event.group === undefined ? [event.id] : [event.id, event.group])), ...counterBonusesOf(formula).map((bonus) => bonus.id)])

const countsNamed = (counts: Tally, named: ReadonlySet<string>): Tally => Object.fromEntries(Object.entries(counts).filter(([id]) => named.has(id)))

/**
 * A log as another formula reads it. What a play counted, it counted under
 * the names of the formula it was begun with; a count under a name this
 * formula lacks is none of its to read — the engine refuses a play that
 * carries one — so it is let go of, and every count the two share stands.
 */
export const readableBy = (formula: FormulaSnapshot, checkpoints: readonly Checkpoint[]): readonly Checkpoint[] => {
  const named = namedBy(formula)
  return checkpoints.map((checkpoint) => ({
    ...checkpoint,
    ...(checkpoint.counter?.bonuses === undefined ? {} : { counter: { ...checkpoint.counter, bonuses: countsNamed(checkpoint.counter.bonuses, named) } }),
    ...(checkpoint.tally === undefined ? {} : { tally: countsNamed(checkpoint.tally, named) }),
  }))
}
