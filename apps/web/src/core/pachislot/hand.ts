import { carriedInOf } from "../play-log/carried-in"
import type { Checkpoint } from "../play-log/checkpoint"
import { savingsDeductedFor, tokensRentedFor, tokenValueOf, type PlayTerms } from "../parlor/terms"
import type { FormulaSnapshot } from "./snapshot"

/**
 * The medals in hand where they were last counted after the play began, and
 * what the play had come to there: the games played by then, the medals
 * won or lost — what is in hand less what was brought, rented and drawn
 * from savings — and the same in yen, the medals in hand and the savings
 * drawn valued at the exchange and the cash at what was paid; neither
 * where the play has no terms to rent and exchange on.
 */
export interface Hand {
  readonly games: number
  readonly held: number
  readonly net: number | undefined
  readonly result: number | undefined
}

/** A running total as the log last gave it at or before a line, none where it never did. */
const runningAt = (ordered: readonly Checkpoint[], line: number, read: (checkpoint: Checkpoint) => number | undefined): number =>
  ordered
    .slice(0, line + 1)
    .map(read)
    .findLast((value) => value !== undefined) ?? 0

/** The medals in hand as last counted after the first line, with what the play had come to there; none where none has been counted since the seat. */
export const handOf = (ordered: readonly Checkpoint[], terms: PlayTerms | undefined): Hand | undefined => {
  const line = ordered.findLastIndex((checkpoint, index) => index > 0 && checkpoint.held !== undefined)
  const counted = ordered[line]
  if (counted?.held === undefined) return undefined
  const brought = carriedInOf(ordered) ?? 0
  const outlay = runningAt(ordered, line, (checkpoint) => checkpoint.outlay)
  const replay = runningAt(ordered, line, (checkpoint) => checkpoint.replay)
  if (terms === undefined) return { games: counted.spins, held: counted.held, net: undefined, result: undefined }
  const value = tokenValueOf(terms)
  return {
    games: counted.spins,
    held: counted.held,
    net: counted.held - brought - tokensRentedFor(terms, outlay) - replay,
    result: Math.round((counted.held - brought - savingsDeductedFor(terms, replay)) * value - outlay),
  }
}

/** Medals a regular game of an AT machine loses: the fifty its ベース lasts that many games on. */
const BASE_MEDALS = 50

/** What a bonus the counter shows gains once it is won, its parts weighed by their chances, and how often a game wins it; none where a part's payout is not known. */
const bonusGain = (formula: FormulaSnapshot, id: string): { readonly chance: number; readonly gain: number } | undefined => {
  const parts = (formula.normalized.tables.at(0)?.events ?? []).filter((event) => event.kind.type === "bonus" && (event.id === id || event.group === id))
  const chance = parts.reduce((sum, part) => sum + part.chance, 0)
  if (parts.length === 0 || chance <= 0 || parts.some((part) => part.kind.type !== "bonus" || part.kind.payout === undefined)) return undefined
  const paid = parts.reduce((sum, part) => sum + part.chance * ((part.kind.type === "bonus" ? (part.kind.payout ?? 0) : 0) - formula.normalized.bet), 0)
  return { chance, gain: paid / chance }
}

/** The day's bonuses the counter last showed at or before a line, by id. */
const bonusesAt = (ordered: readonly Checkpoint[], line: number): Readonly<Record<string, number>> => ordered.slice(0, line + 1).findLast((checkpoint) => checkpoint.counter?.bonuses !== undefined)?.counter?.bonuses ?? {}

/**
 * What a bonus machine's games between two lines likely won or lost: each
 * bonus the counter came to show between them at what it gains, and every
 * other game at what the rest of a game comes to under the lowest setting —
 * its 機械割 less what its bonuses bring, over the games they leave.
 */
const bonusMachineNet = (ordered: readonly Checkpoint[], from: number, to: number, formula: FormulaSnapshot): number | undefined => {
  const figures = formula.figures.at(0)
  const before = bonusesAt(ordered, from)
  const after = bonusesAt(ordered, to)
  const bonuses = (figures?.bonuses ?? []).map((bonus) => ({ won: Math.max(0, (after[bonus.id] ?? 0) - (before[bonus.id] ?? 0)), gain: bonusGain(formula, bonus.id) }))
  if (figures === undefined || bonuses.some((bonus) => bonus.gain === undefined)) return undefined
  const chance = bonuses.reduce((sum, bonus) => sum + (bonus.gain?.chance ?? 0), 0)
  const brought = bonuses.reduce((sum, bonus) => sum + (bonus.gain?.chance ?? 0) * (bonus.gain?.gain ?? 0), 0)
  const rest = (formula.normalized.bet * (figures.payoutRate - 1) - brought) / (1 - chance)
  const won = bonuses.reduce((sum, bonus) => sum + bonus.won, 0)
  const games = (ordered[to]?.spins ?? 0) - (ordered[from]?.spins ?? 0)
  return bonuses.reduce((sum, bonus) => sum + bonus.won * (bonus.gain?.gain ?? 0), 0) + Math.max(0, games - won) * rest
}

/**
 * What an AT machine's games between two lines likely won or lost: each AT
 * won at the medals its result says it took, or what an AT gains on
 * average where it says none, and every regular game at what its ベース
 * loses.
 */
const atMachineNet = (ordered: readonly Checkpoint[], from: number, to: number, formula: FormulaSnapshot): number | undefined => {
  const gain = formula.figures.at(0)?.at?.gain
  const base = formula.normalized.atRules?.base
  if (gain === undefined || base === undefined) return undefined
  const span = ordered.slice(from + 1, to + 1)
  const won = span.filter((checkpoint) => checkpoint.event?.kind === "jackpot").length
  const told = span.flatMap((checkpoint) => (checkpoint.event?.kind === "at-ended" && checkpoint.event.medals !== undefined ? [checkpoint.event.medals] : []))
  const games = (ordered[to]?.spins ?? 0) - (ordered[from]?.spins ?? 0)
  return told.reduce((sum, medals) => sum + medals, 0) + Math.max(0, won - told.length) * gain - (games * BASE_MEDALS) / base
}

/**
 * The medals likely in hand at a play's last line: where they were counted
 * there, that count; otherwise the last count — or what the play was begun
 * with — with the medals rented and drawn from savings since, and what the
 * games since likely won or lost by the formula. Never below none; none
 * where the play has no terms to rent on, or the formula does not say what
 * its games pay.
 */
export const likelyHeldOf = (ordered: readonly Checkpoint[], formula: FormulaSnapshot, terms: PlayTerms | undefined): number | undefined => {
  const last = ordered.length - 1
  const counted = ordered.at(-1)?.held
  if (last > 0 && counted !== undefined) return counted
  if (terms === undefined || last < 0) return undefined
  const from = Math.max(0, ordered.findLastIndex((checkpoint) => checkpoint.held !== undefined))
  const net = formula.normalized.atRules === undefined ? bonusMachineNet(ordered, from, last, formula) : atMachineNet(ordered, from, last, formula)
  if (net === undefined) return undefined
  const rented = tokensRentedFor(terms, runningAt(ordered, last, (checkpoint) => checkpoint.outlay)) - tokensRentedFor(terms, runningAt(ordered, from, (checkpoint) => checkpoint.outlay))
  const drawn = runningAt(ordered, last, (checkpoint) => checkpoint.replay) - runningAt(ordered, from, (checkpoint) => checkpoint.replay)
  return Math.max(0, Math.round((ordered[from]?.held ?? 0) + rented + drawn + net))
}
