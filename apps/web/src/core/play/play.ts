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
 * One play kept by its result in yen alone, as typed in afterwards: no tokens,
 * so no savings move, and a parlor only if one is named.
 */
export interface TalliedPlay extends PlayHead {
  readonly parlor: Parlor | undefined
  /** What the play made, or lost when negative. */
  readonly result: Decimal
}

export const PLAY_TAGS = {
  playId: "play-id",
  gameKind: "game-kind",
  machine: "machine",
  cabinetNumber: "cabinet-number",
  carriedIn: "carried-in",
} as const

/** The parts of a record a person fills in with a number. */
export type NumericField =
  | "outlay"
  | "rental-tokens"
  | "replay-paid-out"
  | "replay-deducted"
  | "carried-in"
  | "payout"
  | "result"
  | "theoretical-value"

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
