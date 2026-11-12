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
  /** What the log of a play followed live counted of the person's own playing: absent from a tally typed in by hand. */
  readonly netCounts?: NetCounts
  /** The words the person tagged it with, each once, in the order they were put on — イベント, 朝一 — for the breakdown to be cut and narrowed by: absent where there are none. */
  readonly userTags?: readonly string[]
  /** What the person wrote down of it in their own words, on one line: absent where they wrote nothing. */
  readonly userMemo?: string
}

/**
 * What the log of a play followed live counted of the person's own playing,
 * from the seat to the finish — never what the cabinet's counter showed
 * before them — by what the game counts.
 *
 * - `pachinko`: the spins and the jackpots, each jackpot of a run counted,
 *   and the regular games alone among the spins: none on a tally written
 *   before they were kept, and the spins none on one taken in from an app
 *   that counted regular games alone.
 * - `at-machine`: a pachislot machine with ATs, the games and the ATs.
 * - `bonus-machine`: a pachislot machine of bonuses alone, the games and the bonuses.
 * - `games`: a pachislot play followed with no formula, which says neither, the games alone.
 */
export type NetCounts =
  | { readonly type: "pachinko"; readonly spins: number | undefined; readonly regularSpins: number | undefined; readonly jackpots: number }
  | { readonly type: "at-machine"; readonly games: number; readonly ats: number }
  | { readonly type: "bonus-machine"; readonly games: number; readonly bonuses: number }
  | { readonly type: "games"; readonly games: number }

/** What is written beside a tally that its form does not ask: when its play began and finished, the spin performance the play's log measured, who sent it, and what its log counted. */
export interface TallyAside {
  readonly clock: PlayClock | undefined
  readonly spinPerformance: Decimal | undefined
  readonly sender: Sender | undefined
  readonly netCounts: NetCounts | undefined
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
 * play before, which put them into savings as what it left: this one is
 * written as what its hand gained or lost against them, so they are counted
 * once, and what the two plays come to together is what the day did.
 *
 * Tokens handed are those other players handed in, below none where more
 * were handed to them: neither won nor lost by the play, so they come in
 * from equity to be played as tokens carried in are, or leave the play's
 * winnings for it, and the tally's result is the play's alone.
 */
export interface TokenTally extends TallyHead {
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly rental: Rental | undefined
  readonly replay: Replay
  readonly carriedIn: Decimal
  readonly handed: Decimal
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
  /** What else was told of it, where its hours were, or what it was inferred to be worth from what its counter showed. */
  readonly told: TallyTold | undefined
  /**
   * What tokens other players handed in came to in yen, below none where
   * more were handed to them, where a play at no parlor followed live said
   * so: beside the two sides, never in them, so the result is the play's
   * alone.
   */
  readonly handed?: Decimal
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
 * - `off-book-exchanged`: counted in tokens on its terms, the outlay as
 *   with `off-book-savings`, but the tokens it had left exchanged for
 *   prizes at the counter: its takings are the tokens handed over, at the
 *   play's exchange rate, and they leave as the prizes taken home — the
 *   special prizes, typed as they were given, and `oddPrizes`, the tokens
 *   left beside them at the play's rental price — with the translation
 *   adjustment between, for hledger to balance.
 * - `cash-and-prizes`: counted in yen alone: the outlay was cash, and the
 *   takings the special prizes taken home.
 */
export type Settlement =
  | { readonly type: "off-book-savings"; readonly cash: Decimal }
  | { readonly type: "off-book-exchanged"; readonly cash: Decimal; readonly specialPrizes: Decimal; readonly oddPrizes: Decimal }
  | { readonly type: "cash-and-prizes" }

/**
 * What a person tells of a play with a tally in yen, beside its two sides:
 * how long it lasted (稼働時間) and, where they looked, the jackpots its
 * counter showed (大当り回数) — and what the play was taken to be worth
 * from them, where it was weighed. An AT machine's play is read by the
 * history its counter showed, its hours left unsaid where nobody said them.
 */
export interface TallyTold {
  /** In hours, to the hundredth: five minutes at a time where a person chose them, and as another app said them where a tally was taken in from one; none where only what it was worth is told. */
  readonly hours: Decimal | undefined
  readonly netJackpots: number | undefined
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
  carriedOut: "carried-out",
  hours: "hours",
  netSpins: "net-spins",
  netRegularSpins: "net-regular-spins",
  netJackpots: "net-jackpots",
  netGames: "net-games",
  netAts: "net-ats",
  netBonuses: "net-bonuses",
  userTag: "user-tag",
  userMemo: "user-memo",
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
  | "handed"
  | "payout"
  | "takings"
  | "special-prizes"
  | "odd-prizes"
  | "exchanged-tokens"
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
  /** Prizes a play at no parlor was exchanged for, given in parts of a yen: prizes are whole yen. */
  | { readonly type: "fractional-prizes" }
  /** A tally in yen at a parlor said to have been settled against savings the book does not keep: a parlor's savings are its own. */
  | { readonly type: "off-book-at-parlor" }
  | { readonly type: "no-exchange-rate"; readonly commodity: string; readonly date: IsoDate }
