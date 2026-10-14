import type { IsoDate } from "../calendar/calendar"
import type { Decimal } from "../decimal/decimal"
import type { Parlor, SavingsPool } from "../parlor/parlor"
import type { PlayGameKind, PlayId } from "../play/play"

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
 * What every tally (収支) says about itself, however its result was kept:
 * the play it is of, by its id, its day, its game and its machine.
 *
 * The theoretical value (期待値), in yen, is what the play was worth by its
 * formula — its result with the luck taken out — and may be left out.
 */
export interface TallyHead {
  readonly id: PlayId
  readonly date: IsoDate
  readonly gameKind: PlayGameKind
  readonly machine: string
  readonly cabinetNumber: string | undefined
  readonly theoreticalValue: Decimal | undefined
  /** When the play began and finished by the clock, where it was said: absent from a tally typed in by hand. */
  readonly clock?: PlayClock
  /** The spins each ¥1,000 bought, to a tenth, as the log of a pachinko play followed live measured it (回転率). */
  readonly spinPerformance?: Decimal
  /** Who played it, where it was sent to the book's owner by someone let in to send plays: absent from a play of the owner's own. */
  readonly sender?: Sender
}

/** What is written beside a tally that its form does not ask: when its play began and finished, the spin performance the play's log measured, and who sent it. */
export interface TallyAside {
  readonly clock: PlayClock | undefined
  readonly spinPerformance: Decimal | undefined
  readonly sender: Sender | undefined
}

/**
 * Someone a book's owner let in to send plays, as an entry keeps them: the
 * invitation's id, which stays theirs whatever they are called, and the
 * name the owner gave them as the play was recorded. A person invited
 * again is another id; the name says who either was.
 */
export interface Sender {
  readonly id: string
  readonly name: string
}

/** A time on a clock's face, to the minute. */
export interface ClockTime {
  readonly hour: number
  readonly minute: number
}

/**
 * When a play began and finished by the clock, as the person said it as its
 * tally was recorded — which need not be what its log says. Written beside
 * the tally for people to read, and read back so a tally set right keeps it.
 */
export interface PlayClock {
  readonly started: ClockTime | undefined
  readonly finished: ClockTime | undefined
}

/**
 * A tally kept in tokens (玉数で記帳した収支): one play at one cabinet, in
 * tokens of one pool — a kind at a rental rate — at its parlor:
 * everything that went in and what came out.
 *
 * Tokens rented or paid out from savings are all shot; whatever is left at
 * the finish goes back into savings as the payout. Exchanging savings for cash is
 * a separate act, not part of a play.
 *
 * Tokens carried in are those in hand as the play began, brought from the
 * play before: that play put them into savings as what it left, so this one
 * takes them out again, with no fee — they never went to the counter — and
 * what the two plays come to together is what the day did.
 */
export interface TokenTally extends TallyHead {
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly rental: Rental | undefined
  readonly replay: Replay
  readonly carriedIn: Decimal
  readonly payout: Decimal
}

/**
 * A tally kept in yen alone (円で記帳した収支), as typed in afterwards or
 * as a play at no parlor finished: what went in and what came back, whose
 * difference is its result. No tokens, so no savings move, and a parlor
 * only if one is named.
 */
export interface YenTally extends TallyHead {
  readonly parlor: Parlor | undefined
  /** What was put in, in yen (投資額). */
  readonly outlay: Decimal
  /** What came back, in yen (回収額). */
  readonly takings: Decimal
  /** How its two sides were settled, where that is known: a tally typed in by hand or taken in from another app knows only what lies between them. */
  readonly settlement: Settlement | undefined
  /** What else was told of it, where its hours were. */
  readonly told: TallyTold | undefined
}

/**
 * How a tally in yen's two sides were settled, where a play at no parlor
 * followed live says.
 *
 * - `off-book-savings`: counted in tokens on its terms. Of the outlay,
 *   `cash` was cash; the rest — the tokens it was begun with and those it
 *   drew from savings — came from savings the book does not keep (簿外貯玉),
 *   and the tokens it had left, its takings, went back to them. No prize
 *   is written: the tokens never stopped being tokens.
 * - `cash-and-prizes`: counted in yen alone: the outlay was cash, and the
 *   takings the special prizes taken home.
 */
export type Settlement = { readonly type: "off-book-savings"; readonly cash: Decimal } | { readonly type: "cash-and-prizes" }

/**
 * What a person tells of a play with a tally in yen, beside its two sides:
 * how long it lasted (稼働時間) and, where they looked, the jackpots its
 * counter showed (大当り回数) — and what the play was taken to be worth
 * from them, where it was weighed.
 */
export interface TallyTold {
  /** In hours, to the hundredth: five minutes at a time where a person chose them, and as another app said them where a tally was taken in from one. */
  readonly hours: Decimal
  readonly jackpots: number | undefined
  readonly inferred: InferredWorth | undefined
}

/**
 * A theoretical value nobody measured (推定期待値): what a told tally's play was
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
  /** The spin performance the play was taken to have had, to a tenth: absent from a tally weighed before it was kept. */
  readonly spinPerformance: Decimal | undefined
}

/** The tags a tally's entry carries, by what each says: the names are data already written, `play-id` among them. */
export const TALLY_TAGS = {
  playId: "play-id",
  gameKind: "game-kind",
  machine: "machine",
  cabinetNumber: "cabinet-number",
  started: "started",
  finished: "finished",
  spinPerformance: "spin-performance",
  carriedIn: "carried-in",
  hours: "hours",
  jackpots: "jackpots",
  inferredFormula: "inferred-formula",
  tokenRental: "token-rental",
  tokenExchange: "token-exchange",
  inferredSpinPerformance: "inferred-spin-performance",
  senderId: "sender-id",
  sender: "sender",
} as const

/** The parts of a tally a person fills in with a number. */
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

/** The parts of a tally a person fills in with words. */
export type TextField = "machine" | "cabinet-number"

/** Why a tally cannot be written as an entry. */
export type TallyError =
  | { readonly type: "machine-missing" }
  | { readonly type: "text-unwritable"; readonly field: TextField; readonly text: string }
  | { readonly type: "negative-amount"; readonly field: NumericField }
  | { readonly type: "fractional-tokens"; readonly field: NumericField }
  | { readonly type: "rental-incomplete" }
  | { readonly type: "nothing-played" }
  | { readonly type: "pool-not-kept"; readonly parlor: Parlor; readonly pool: SavingsPool }
  /** A replay that took less off savings than it paid out: no parlor pays to be replayed at. */
  | { readonly type: "replay-below-payout" }
  /** A tally in yen whose cash was more than it put in all told. */
  | { readonly type: "cash-beyond-outlay" }
  /** A tally in yen at a parlor said to have been settled against savings the book does not keep: a parlor's savings are its own. */
  | { readonly type: "off-book-at-parlor" }
  | { readonly type: "no-exchange-rate"; readonly commodity: string; readonly date: IsoDate }
