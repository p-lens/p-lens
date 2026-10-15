import type { PathDto, SegmentDto, ToldPathDto } from "@p-lens/contracts/pachislot"

import { decimal, quotient, toPlainString, type Decimal } from "../decimal/decimal"

import type { PlayTerms } from "../parlor/terms"
import type { Counts } from "../play-log/checkpoint"
import type { InferredWorth } from "../tally/tally"
import { theoreticalDecimalOf } from "../theoretical/theoretical"
import { GAMES_PER_HOUR } from "./weighing"

/**
 * What a person tells of a pachislot play afterwards, typed in by its
 * totals: what the data counter showed at the finish — the day's games and
 * each bonus by the id the counter shows it as — which its setting level is
 * read from, and how long they played and the cash they put in, which its
 * theoretical value is worked out over.
 */
export interface Told {
  readonly games: number
  readonly bonuses: Counts
  readonly hours: number
  readonly outlay: number
}

/**
 * What a person tells of a pachislot play at an AT machine afterwards: the
 * games since the last AT the data counter showed when they sat down,
 * whether the settings had been changed before that with no AT since, then
 * each AT won as they played — the games since the one before, or since
 * they sat for the first, and the triggers missed on the way where they
 * counted them: the first's since the last AT — and the games since the
 * last one when they stopped; and the cash they put in.
 */
export interface AtTold {
  readonly sinceAt: number
  readonly afterReset: boolean
  readonly ats: readonly AtWon[]
  readonly since: number
  readonly outlay: number
}

/** An AT won: the regular games it took, and the triggers missed in them where counted. */
export interface AtWon {
  readonly games: number
  readonly misses: number | undefined
}

/** What a play told of afterwards tells its setting level by: a bonus machine's data counter, or an AT machine's history. */
export type SettingTold = { readonly type: "counter"; readonly told: Told } | { readonly type: "history"; readonly told: AtTold }

/** An AT play told by its totals as the engine reads its setting level from it: each AT a leg won, and the games since the last one still going. */
export const toldPathOf = (told: AtTold): ToldPathDto => ({
  afterReset: told.afterReset,
  sinceAt: told.sinceAt,
  legs: [...told.ats.map((at) => ({ games: at.games, won: true, ...(at.misses === undefined ? {} : { misses: at.misses }) })), ...(told.since > 0 ? [{ games: told.since, won: false }] : [])],
})

/**
 * An AT play told by its totals as the path its theoretical value is
 * walked along, as the live screen walks one: from where it was first
 * seen, each AT won and the games since the last, what each AT came to
 * untold. The games since the last trigger are taken to be those since
 * the last AT, which a history does not tell apart.
 */
export const toldAtPathOf = (told: AtTold): PathDto => ({
  start: { sinceTrigger: told.sinceAt, sinceAt: told.sinceAt, misses: 0, afterReset: told.afterReset },
  legs: [...told.ats.map((at) => ({ games: at.games, end: "won-at" as const })), ...(told.since > 0 ? [{ games: told.since, end: "going" as const }] : [])],
})

/** The regular games an AT play told by its totals played. */
export const atGamesOf = (told: AtTold): number => told.ats.reduce((games, at) => games + at.games, told.since)

/** What a told play's medals were rented and exchanged at, as a corner states them: so many for ¥1,000 rented, so many for ¥100 of prizes. */
export interface MedalTerms {
  readonly rentedPerThousand: number
  readonly exchangedPerHundred: number
}

/** A 20-yen corner as most are: 46 medals for ¥1,000, the tax on top, and 5.1 exchanged for ¥100. */
export const MEDAL_TERMS_BY_DEFAULT: MedalTerms = { rentedPerThousand: 46, exchangedPerHundred: 5.1 }

/**
 * A told play's terms as a play's are, in whole medals — the exchange as so
 * many for ¥10,000, a hundred times what ¥100 takes, so 5.1 is 510 — a
 * replay taking what it pays out: nothing is drawn from savings in a play
 * told by its totals.
 */
export const playTermsOf = (terms: MedalTerms): PlayTerms => ({
  rental: { yen: 1000, tokens: terms.rentedPerThousand },
  exchange: { yen: 10_000, tokens: Math.round(terms.exchangedPerHundred * 100) },
  replay: { paidOut: 1, deducted: 1 },
})

/** What the counter showed, as the one stretch of games a setting level is read from: a bonus counted none is left out. */
export const segmentOf = (told: Pick<Told, "games" | "bonuses">): SegmentDto => ({
  games: told.games,
  counts: Object.entries(told.bonuses)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count })),
})

/** The games a told play's hours come to, at the pace 期待値/時 is worked out at. */
export const playedGamesOf = (told: Pick<Told, "hours">): number => Math.round(told.hours * GAMES_PER_HOUR)

/** Yen a medal rented for, to six places, as an entry keeps the terms a play was weighed on. */
const rentalPriceOf = (terms: MedalTerms): Decimal => quotient(decimal(1000n, 0), decimal(BigInt(terms.rentedPerThousand), 0), 6)

/** What a told play's setting level made it worth, as its entry keeps it: the value to six places, with the formula and the terms it stood on. */
export const inferredWorthOf = (formulaId: string, theoreticalValue: number, terms: MedalTerms): InferredWorth => ({
  value: theoreticalDecimalOf(theoreticalValue),
  formulaId,
  tokenRental: rentalPriceOf(terms),
  tokenExchange: theoreticalDecimalOf(terms.exchangedPerHundred),
  spinPerformance: undefined,
})

/** The terms an entry kept back as typed, where it kept a pachislot play's: the medals ¥1,000 rented, from the yen one rented for. */
export const medalTermsOf = (inferred: Pick<InferredWorth, "tokenRental" | "tokenExchange">): MedalTerms => ({
  rentedPerThousand: Math.round(1000 / Number(toPlainString(inferred.tokenRental))),
  exchangedPerHundred: Number(toPlainString(inferred.tokenExchange)),
})
