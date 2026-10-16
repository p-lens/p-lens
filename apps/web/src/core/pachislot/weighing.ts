import type { AtRulesDto, NormalizedSpecDto, PlayDto } from "@p-lens/contracts/pachislot"

import { tokenValueOf, type PlayTerms } from "../parlor/terms"
import type { Checkpoint, Counts } from "../play-log/checkpoint"
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

/** Something a player can count at the cabinet: a small win, a replay, a bonus or a part of one, or a cue watched for over a bonus, by its id and label. */
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

const cuesOf = (normalized: NormalizedSpecDto) => normalized.tables.at(0)?.cues ?? []

/**
 * Everything a player can count, in the spec's order: what a game can come
 * to — a bonus told apart by its parts counted part by part — then the cues
 * watched for over a bonus.
 */
export const countablesOf = (formula: FormulaSnapshot): readonly Countable[] =>
  [...eventsOf(formula.normalized), ...cuesOf(formula.normalized)].map((each) => ({ id: each.id, label: formula.labels[each.id] || each.id }))

/** How many of a bonus are counted: the bonus itself, or each of its parts. */
const bonusesCounted = (normalized: NormalizedSpecDto, counts: Counts, bonus: string): number =>
  eventsOf(normalized)
    .filter((event) => event.id === bonus || event.group === bonus)
    .reduce((sum, event) => sum + (counts[event.id] ?? 0), 0)

/**
 * What a count is out of, for saying how often it came up: the games
 * counted, for what a game comes to; for a cue, the trials watched — each
 * of its bonus counted times the trials one gives, or, where a trial shows
 * one of its watch's cues certainly, the cues of the watch counted.
 */
export const countedOutOf =
  (normalized: NormalizedSpecDto, counts: Counts, games: number) =>
  (id: string): number => {
    const cue = cuesOf(normalized).find((each) => each.id === id)
    const watch = normalized.watches?.find((each) => each.id === cue?.watch)
    if (cue === undefined || watch === undefined) return games
    if (watch.whole) return cuesOf(normalized).filter((each) => each.watch === watch.id).reduce((sum, each) => sum + (counts[each.id] ?? 0), 0)
    return bonusesCounted(normalized, counts, watch.bonus) * watch.trials
  }

/** The bonuses a data counter shows, as the formula names them. */
export const counterBonusesOf = (formula: FormulaSnapshot): readonly Countable[] =>
  (formula.figures.at(0)?.bonuses ?? []).map((bonus) => ({ id: bonus.id, label: bonus.label }))

/** The setting levels a formula has, as the tables the engine solves give them. */
export const settingLevelsOf = (formula: FormulaSnapshot): readonly number[] => formula.normalized.tables.map((table) => table.settingLevel)

/**
 * The play's terms as the engine weighs them: what a medal exchanges for,
 * what renting one costs, and the shares of the medals played that were
 * rented for cash — the outlay in medals over the medals played — and drawn
 * from savings, at the medals a replay takes off them for each it pays out.
 * The rented and the drawn are taken as played first, the rented before the
 * drawn. With neither known, or no game played yet, the cash share is what a
 * machine paying back `payoutRate` leaves short over a long play,
 * `1 − payoutRate`, and none above 100%, where the play runs on what it pays
 * out; with savings drawn and no outlay said, savings cover that shortfall
 * first. None without terms.
 */
export const playOf = (terms: PlayTerms | undefined, play: PlayCounted): PlayDto | undefined => (terms === undefined ? undefined : pricedPlayOf(terms, play))

/** What a play's medals are weighed by beside its terms: its bet, the games played, the outlay and the medals drawn from savings where said, and what the machine pays back. */
interface PlayCounted {
  readonly bet: number
  readonly games: number
  readonly outlay: number | undefined
  readonly replay: number | undefined
  readonly payoutRate: number
}

/** A play's terms as the engine weighs them, where it has terms: as `playOf` says. */
export const pricedPlayOf = (terms: PlayTerms, play: PlayCounted): PlayDto => {
  const played = play.games * play.bet
  const shortfall = Math.min(1, Math.max(0, 1 - play.payoutRate))
  const known = played > 0 && (play.outlay !== undefined || play.replay !== undefined)
  const drawnShare = known ? (play.replay ?? 0) / played : 0
  const cashShare = !known ? shortfall : play.outlay === undefined ? Math.max(0, shortfall - drawnShare) : Math.min(1, (play.outlay * terms.rental.tokens) / terms.rental.yen / played)
  return {
    medalValue: tokenValueOf(terms),
    rentalPrice: terms.rental.yen / terms.rental.tokens,
    cashShare,
    replayShare: Math.min(1 - cashShare, drawnShare),
    replayRate: terms.replay.deducted / terms.replay.paidOut,
    gamesPerHour: GAMES_PER_HOUR,
  }
}

/**
 * The terms 天井狙い is weighed on, as pachinko's ハイエナ is: sat down with
 * no medals, every regular game until the AT loses what the ベース says,
 * rented for cash — the loss per game over the bet, all of it where that is
 * more — and the AT's medals are exchanged.
 */
export const huntPlayOf = (terms: PlayTerms, rules: AtRulesDto, bet: number): PlayDto => ({
  medalValue: tokenValueOf(terms),
  rentalPrice: terms.rental.yen / terms.rental.tokens,
  cashShare: Math.min(1, 50 / rules.base / bet),
})

/** Every name a formula counts by: each event, the bonus a part is part of, and the bonuses a data counter shows. */
const namedBy = (formula: FormulaSnapshot): ReadonlySet<string> =>
  new Set([...eventsOf(formula.normalized).flatMap((event) => (event.group === undefined ? [event.id] : [event.id, event.group])), ...counterBonusesOf(formula).map((bonus) => bonus.id)])

const countsNamed = (counts: Counts, named: ReadonlySet<string>): Counts => Object.fromEntries(Object.entries(counts).filter(([id]) => named.has(id)))

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
