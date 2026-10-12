import type { IsoDate } from "../calendar/calendar"
import type { TokenKind } from "../commodity/commodity"
import type { Decimal } from "../decimal/decimal"
import type { Parlor, SavingsPool } from "../parlor/parlor"

export type PlayId = string & { readonly __brand: "PlayId" }

/**
 * The game a play is of, as its book says in `game-kind`: pachislot is `slot`
 * there, data already written, where the catalog's `GameKind` says
 * `pachislot`. Pachinko is played with balls, pachislot with medals.
 */
export type PlayGameKind = "pachinko" | "slot"

const TOKENS_OF: Readonly<Record<PlayGameKind, TokenKind>> = { pachinko: "ball", slot: "medal" }

export const tokenKindOf = (kind: PlayGameKind): TokenKind => TOKENS_OF[kind]

/** Cash handed over for tokens at the parlor's rental price. */
export interface Rental {
  readonly outlay: Decimal
  readonly tokens: Decimal
}

/** Tokens drawn from savings to play: what was paid out, and what savings lost for it, the fee between. */
export interface Replay {
  readonly paidOut: Decimal
  readonly deducted: Decimal
}

/**
 * What every recorded play says about itself, however its result was kept.
 *
 * The theoretical value (期待値), in yen, is what the play was worth by its
 * formula — its result with the luck taken out — and may be left out.
 */
export interface PlayHead {
  readonly id: PlayId
  readonly date: IsoDate
  readonly gameKind: PlayGameKind
  readonly machine: string
  readonly cabinetNumber: string | undefined
  readonly theoreticalValue: Decimal | undefined
}

/**
 * One play at one cabinet, kept in tokens of one pool — a kind at a rental
 * rate — at its parlor: everything that went in and what came out.
 *
 * Tokens rented or paid out from savings are all shot; whatever is left at
 * the end goes back into savings as the payout. Exchanging savings for cash is
 * a separate act, not part of a play.
 *
 * Tokens carried in are those in hand as the play began, brought from the
 * play before: that play put them into savings as what it left, so this one
 * takes them out again, with no fee — they never went to the counter — and
 * what the two plays come to together is what the day did.
 */
export interface PlayRecord extends PlayHead {
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly rental: Rental | undefined
  readonly replay: Replay
  readonly carriedIn: Decimal
  readonly payout: Decimal
}

/**
 * One play kept in yen alone, as typed in afterwards: what went in and what
 * came back, whose difference is its result. No tokens, so no savings move,
 * and a parlor only if one is named.
 */
export interface TalliedPlay extends PlayHead {
  readonly parlor: Parlor | undefined
  /** What was put in, in yen (投資額). */
  readonly outlay: Decimal
  /** What came back, in yen (回収額). */
  readonly takings: Decimal
  /** What else was told of it, where its hours were. */
  readonly told: PlayTold | undefined
}

/**
 * What a person tells of a play typed in afterwards, beside its two sides:
 * how long it lasted (稼働時間) and, where they looked, the jackpots its
 * counter showed (大当り回数) — and what the play was taken to be worth
 * from them, where it was weighed.
 */
export interface PlayTold {
  /** In hours, to the hundredth: five minutes at a time where a person chose them, and as another app said them where a play was taken in from one. */
  readonly hours: Decimal
  readonly jackpots: number | undefined
  readonly inferred: InferredWorth | undefined
}

/**
 * A theoretical value nobody measured (推定期待値): what a told play was
 * taken to be worth, in yen, with what the taking stood on — the formula
 * the machine was played out by, what a token rented for and what ¥100 of
 * prizes took in tokens — so the same play is weighed the same again.
 */
export interface InferredWorth {
  readonly value: Decimal
  readonly formulaId: string
  /** Yen a token rented for. */
  readonly tokenRental: Decimal
  /** Tokens ¥100 of prizes took. */
  readonly tokenExchange: Decimal
}

export const PLAY_TAGS = {
  playId: "play-id",
  gameKind: "game-kind",
  machine: "machine",
  cabinetNumber: "cabinet-number",
  carriedIn: "carried-in",
  hours: "hours",
  jackpots: "jackpots",
  inferredFormula: "inferred-formula",
  tokenRental: "token-rental",
  tokenExchange: "token-exchange",
} as const

/** The parts of a record a person fills in with a number. */
export type NumericField =
  | "outlay"
  | "rental-tokens"
  | "replay-paid-out"
  | "replay-deducted"
  | "carried-in"
  | "payout"
  | "takings"
  | "theoretical-value"
  | "jackpots"

/** The parts of a record a person fills in with words. */
export type TextField = "machine" | "cabinet-number"

export type PlayError =
  | { readonly type: "machine-missing" }
  | { readonly type: "text-unwritable"; readonly field: TextField; readonly text: string }
  | { readonly type: "negative-amount"; readonly field: NumericField }
  | { readonly type: "fractional-tokens"; readonly field: NumericField }
  | { readonly type: "rental-incomplete" }
  | { readonly type: "nothing-played" }
  | { readonly type: "pool-not-kept"; readonly parlor: Parlor; readonly pool: SavingsPool }
  /** A replay that took less off savings than it paid out: no parlor pays to be replayed at. */
  | { readonly type: "replay-below-payout" }
  | { readonly type: "no-exchange-rate"; readonly commodity: string; readonly date: IsoDate }
