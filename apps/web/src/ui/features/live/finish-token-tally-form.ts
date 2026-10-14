import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { tokenCommodity } from "../../../core/commodity/commodity"
import { ZERO, decimal, isZero, parseDecimal, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import type { PlayDraft } from "../../../core/live-play/draft"
import { samePool, type Parlor, type SavingsPool } from "../../../core/parlor/parlor"
import { exchangeRateOf, poolOf, savingsDeductedFor, tokensRentedFor, type PlayTerms } from "../../../core/parlor/terms"
import type { NumericField, TokenTally } from "../../../core/tally/tally"
import type { PlayGameKind, PlayId } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import { theoreticalDecimalOf } from "../../../core/theoretical/theoretical"
import type { PricePoint } from "../../../core/valuation/valuation"
import { problemOf, readOptionalYen, type FieldProblem, type PlayedSoFar, type Read } from "./finish-tally-reading"

/**
 * The form a play followed live at a parlor is recorded with, as typed:
 * every field text, nothing yet read. Where it was played and on what
 * terms are its play's, not the form's; the tokens rented and the savings a
 * replay took follow from them.
 */
export interface FinishTokenTallyForm {
  readonly date: string
  readonly machine: string
  readonly cabinetNumber: string
  readonly outlay: string
  /** The tokens drawn from savings. */
  readonly replayPaidOut: string
  /** The tokens in hand as the play began, brought from the play before. */
  readonly carriedIn: string
  readonly payout: string
  readonly theoreticalValue: string
}

/**
 * Where a play followed live at a parlor was played and what its sums are
 * counted by: the corner's terms. The parlor is said to have the pool
 * those terms make, whatever it had when the play began: the pool is
 * opened in the book as the tally is recorded.
 */
export interface PlayedOnTerms {
  readonly parlor: Parlor
  readonly gameKind: PlayGameKind
  readonly pool: SavingsPool
  /** What a sum of yen rents. */
  readonly rental: PlayTerms["rental"]
  /** What a replay takes off savings for what it pays out. */
  readonly replay: PlayTerms["replay"]
  /** Yen a token exchanges for at the corner. */
  readonly exchangeRate: Decimal
}

export const playedOnTerms = (parlor: Parlor, terms: PlayTerms, gameKind: PlayGameKind): PlayedOnTerms => ({
  parlor: parlor.pools.some((pool) => samePool(pool, poolOf(gameKind, terms))) ? parlor : { ...parlor, pools: [...parlor.pools, poolOf(gameKind, terms)] },
  gameKind,
  pool: poolOf(gameKind, terms),
  rental: terms.rental,
  replay: terms.replay,
  exchangeRate: exchangeRateOf(terms),
})

/**
 * The book's prices as they will stand when the tally of a day is written:
 * with the corner's rate on that day. A pool the book does not keep yet is
 * opened as the tally is recorded, and what the form shows of the entry is
 * composed on these, not on a book that has yet to hear of the pool.
 */
export const pricesPlayedOn = (at: PlayedOnTerms, date: IsoDate, prices: readonly PricePoint[]): readonly PricePoint[] => [
  ...prices,
  { date, commodity: tokenCommodity(at.pool.kind, at.parlor.name, at.pool.tier), rate: at.exchangeRate },
]

/** A count as a plain number, for the terms' arithmetic; a fraction is the core's to refuse, so it passes through. */
const countOf = (value: Decimal): number => Number(value.mantissa) / 10 ** value.places

/** A number left empty is zero: nothing was rented, nothing replayed. */
const readCount = (text: string, field: NumericField): Read<Decimal> => {
  if (tidyTyped(text) === "") return Ok(ZERO)
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field, reason: "not-a-number" })
}

const whole = (value: number): Decimal => decimal(BigInt(value), 0)

/** Tokens the outlay rented, by the terms. */
const rentedFor = (at: PlayedOnTerms, outlay: Decimal): Decimal => whole(tokensRentedFor({ rental: at.rental }, countOf(outlay)))

/** Savings a replay took, by the terms. */
const deductedFor = (at: PlayedOnTerms, paidOut: Decimal): Decimal => whole(savingsDeductedFor({ replay: at.replay }, countOf(paidOut)))

/**
 * The form read into a tally in tokens, or every field that could not be
 * read. Whether the tally makes sense is the core's to say afterwards.
 */
export const readFinishTokenTallyForm = (form: FinishTokenTallyForm, at: PlayedOnTerms, id: PlayId): Result<TokenTally, readonly FieldProblem[]> => {
  const date = parseIsoDate(form.date)
  const dateRead: Read<IsoDate> = date.ok ? date : Err({ field: "date", reason: "not-a-date" })
  const outlay = readCount(form.outlay, "outlay")
  const paidOut = readCount(form.replayPaidOut, "replay-paid-out")
  const carriedIn = readCount(form.carriedIn, "carried-in")
  const payout = readCount(form.payout, "payout")
  const theoreticalValue = readOptionalYen(form.theoreticalValue, "theoretical-value")
  if (!dateRead.ok || !outlay.ok || !paidOut.ok || !carriedIn.ok || !payout.ok || !theoreticalValue.ok) return Err([dateRead, outlay, paidOut, carriedIn, payout, theoreticalValue].flatMap(problemOf))
  const rented = rentedFor(at, outlay.value)
  return Ok({
    id,
    date: dateRead.value,
    parlor: at.parlor,
    pool: at.pool,
    gameKind: at.gameKind,
    machine: form.machine,
    cabinetNumber: form.cabinetNumber.trim() === "" ? undefined : form.cabinetNumber,
    rental: isZero(outlay.value) && isZero(rented) ? undefined : { outlay: outlay.value, tokens: rented },
    replay: { paidOut: paidOut.value, deducted: deductedFor(at, paidOut.value) },
    carriedIn: carriedIn.value,
    payout: payout.value,
    theoreticalValue: theoreticalValue.value,
  })
}

const filled = (count: number | undefined): string => (count === undefined || count === 0 ? "" : String(count))

/**
 * The form filled in from a play followed live at a parlor: its outlay,
 * what it drew from savings — the fee that took follows from the corner's
 * terms, as ever — the tokens it was begun with in hand, the tokens counted
 * in hand at its last line as what it leaves, and the theoretical value
 * its formula comes to, where there is one.
 */
export const finishTokenTallyFormOf = (draft: PlayDraft, played: PlayedSoFar): FinishTokenTallyForm => ({
  date: draft.date,
  machine: draft.machine,
  cabinetNumber: draft.cabinetNumber ?? "",
  outlay: filled(played.outlay),
  replayPaidOut: filled(played.replay),
  carriedIn: filled(played.carriedIn),
  payout: filled(played.held),
  theoreticalValue: played.theoreticalValue === undefined ? "" : toPlainString(theoreticalDecimalOf(played.theoreticalValue)),
})
