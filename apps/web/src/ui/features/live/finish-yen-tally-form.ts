import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { ZERO, add, compare, decimal, isNegative, isZero, parseDecimal, subtract, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import type { PlayDraft } from "../../../core/live-play/draft"
import type { Parlor } from "../../../core/parlor/parlor"
import { exchangeRateOf, rentalPriceOf, savingsDeductedFor, tokensRentedFor, tokenValueOf, type PlayTerms } from "../../../core/parlor/terms"
import { exchangedOddPrizes } from "../../../core/savings/prize-exchange"
import type { Settlement, YenTally } from "../../../core/tally/tally"
import type { PlayGameKind, PlayId } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import { theoreticalDecimalOf } from "../../../core/theoretical/theoretical"
import { problemOf, readOptionalYen, type FieldProblem, type PlayedSoFar, type Read } from "./finish-tally-reading"

/**
 * The form a play followed live at no parlor is recorded with, as typed:
 * every field text, nothing yet read. Its game is the one it was followed
 * as. Where it has terms, its two sides are worked out from the cash spent,
 * the tokens drawn from savings and the tokens it was begun with and had
 * left; where it has none, what came back is typed in yen.
 */
export interface FinishYenTallyForm {
  readonly date: string
  readonly gameKind: PlayGameKind
  readonly machine: string
  readonly cabinetNumber: string
  /** The cash spent. */
  readonly outlay: string
  /** The tokens drawn from savings the book does not keep. */
  readonly replayPaidOut: string
  /** The tokens in hand as the play began, brought from the play before. */
  readonly carriedIn: string
  /** The tokens in hand as the play finished. */
  readonly payout: string
  /** What came back in yen, read only where no token value is known. */
  readonly takings: string
  /** Where the play has terms: whether the tokens in hand at the finish were exchanged for prizes at the counter, rather than carried on. */
  readonly exchanged: boolean
  /** The tokens handed over at the counter, as the counter counted them, read only where they were exchanged. */
  readonly exchangedTokens: string
  /** The special prizes they were exchanged for, in yen, read only where they were. */
  readonly specialPrizes: string
  readonly theoreticalValue: string
}

/** An outlay must be given: a play that cost nothing is typed as 0, not left out. */
const readOutlay = (text: string): Read<Decimal> => {
  if (tidyTyped(text) === "") return Err({ field: "outlay", reason: "required" })
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field: "outlay", reason: "not-a-number" })
}

/** The special prizes in yen, which must be given where the tokens were exchanged. */
const readSpecialPrizes = (text: string): Read<Decimal> => {
  if (tidyTyped(text) === "") return Err({ field: "special-prizes", reason: "required" })
  const parsed = parseDecimal(tidyTyped(text).replaceAll(",", ""))
  return parsed.ok ? parsed : Err({ field: "special-prizes", reason: "not-a-number" })
}

/** The odd prizes of tokens exchanged at a play's terms for special prizes, as a prize exchange counts them, at the rental price. */
const exchangedOddPrizesOn = (held: Decimal, terms: PlayTerms, special: Decimal): Decimal => exchangedOddPrizes(held, exchangeRateOf(terms), special, rentalPriceOf(terms))

/**
 * The odd prizes the tokens in hand came to beside the special ones: the
 * odd tokens the special prizes leave at the play's rental price, in whole
 * yen — nobody counts the sweets. None where the special prizes took every
 * token or more, the rate typed being then lower than the parlor's.
 */
const oddPrizesFor = (held: Decimal, terms: PlayTerms, special: Decimal): Decimal => ((odd) => (isNegative(odd) ? ZERO : odd))(exchangedOddPrizesOn(held, terms, special))

/** The odd prizes the tokens handed over and the special prizes typed come to, shown beside them; none while either does not read. */
export const oddPrizesOf = (form: Pick<FinishYenTallyForm, "exchangedTokens" | "specialPrizes">, terms: PlayTerms): Decimal | undefined => {
  const [handed, special] = [readCount(form.exchangedTokens, "exchanged-tokens"), readSpecialPrizes(form.specialPrizes)]
  return handed.ok && special.ok ? oddPrizesFor(handed.value, terms, special.value) : undefined
}

/** The largest step special prizes come in at any parlor: odd prizes beyond it suggest the rate is off. */
const LARGEST_PRIZE_STEP = decimal(1000n, 0)

/**
 * Whether the count handed over and the special prizes typed cannot have
 * been an exchange at the play's rate: the special prizes worth more than
 * the tokens were, or leaving odd prizes beyond the largest step special
 * ones come in. Only said, never refused: the rate may be what was typed wrong.
 * Not where there are no special prizes: the tokens went for odd and
 * general prizes alone, as they may.
 */
export const offTheRate = (form: Pick<FinishYenTallyForm, "exchangedTokens" | "specialPrizes">, terms: PlayTerms): boolean => {
  const [handed, special] = [readCount(form.exchangedTokens, "exchanged-tokens"), readSpecialPrizes(form.specialPrizes)]
  if (!handed.ok || !special.ok || isZero(handed.value) || isZero(special.value)) return false
  const odd = exchangedOddPrizesOn(handed.value, terms, special.value)
  return isNegative(odd) || compare(odd, LARGEST_PRIZE_STEP) > 0
}

/** The form with its tokens in hand said to be exchanged, the count handed over begun as the tokens in hand. */
export const exchangedFrom = (form: FinishYenTallyForm): FinishYenTallyForm => ({ ...form, exchanged: true, exchangedTokens: form.payout })

/** Yen left empty are none. */
const readTakings = (text: string): Read<Decimal> => {
  if (tidyTyped(text) === "") return Ok(ZERO)
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field: "takings", reason: "not-a-number" })
}

const COUNT = /^\d+$/

/** Tokens counted: a whole number, none where left empty. */
const readCount = (text: string, field: "replay-paid-out" | "carried-in" | "payout" | "exchanged-tokens"): Read<Decimal> => {
  const plain = tidyTyped(text).replaceAll(",", "")
  if (plain === "") return Ok(ZERO)
  return COUNT.test(plain) ? Ok(decimal(BigInt(plain), 0)) : Err({ field, reason: "not-a-number" })
}

/** Tokens at a token's worth, in whole yen. */
const yenOf = (tokens: Decimal, tokenValue: number): Decimal => decimal(BigInt(Math.round(Number(toPlainString(tokens)) * tokenValue)), 0)

interface Sides {
  readonly outlay: Decimal
  readonly takings: Decimal
  readonly settlement: Settlement
}

/** The tokens the cash spent rented by the play's terms, as a play at a parlor shows them under its outlay; none while the cash does not read, or where none was spent. */
export const rentedOf = (form: Pick<FinishYenTallyForm, "outlay">, terms: PlayTerms): Decimal | undefined => {
  const outlay = readOutlay(form.outlay)
  return !outlay.ok || isZero(outlay.value) ? undefined : decimal(BigInt(tokensRentedFor(terms, Number(toPlainString(outlay.value)))), 0)
}

/** The savings a draw took by the play's terms, the fee included; none while the draw does not read. */
export const offBookDeductedOf = (form: Pick<FinishYenTallyForm, "replayPaidOut">, terms: PlayTerms): Decimal | undefined => {
  const paidOut = readCount(form.replayPaidOut, "replay-paid-out")
  return paidOut.ok ? decimal(BigInt(savingsDeductedFor(terms, Number(toPlainString(paidOut.value)))), 0) : undefined
}

/**
 * The two sides of the play and how they were settled. With terms: the cash
 * spent, the savings a draw took and the tokens it was begun with went in,
 * at the exchange, and the tokens in hand at the finish came back — all
 * but the cash from and to savings the book does not keep, so the plays of
 * a day at no parlor hand their tokens on through them and cash falls by
 * the cash spent alone — unless the tokens in hand were exchanged for
 * prizes at the counter, when what came back is the count handed over at
 * the exchange, and it leaves as the special prizes typed and the odd
 * ones beside them at the rental price. With none: the cash spent, and
 * the yen typed as come back, the prizes taken home.
 */
const readSides = (form: FinishYenTallyForm, terms: PlayTerms | undefined): Result<Sides, readonly FieldProblem[]> => {
  const outlay = readOutlay(form.outlay)
  if (terms === undefined) {
    const takings = readTakings(form.takings)
    return outlay.ok && takings.ok ? Ok({ outlay: outlay.value, takings: takings.value, settlement: { type: "cash-and-prizes" } }) : Err([outlay, takings].flatMap(problemOf))
  }
  const tokenValue = tokenValueOf(terms)
  const paidOut = readCount(form.replayPaidOut, "replay-paid-out")
  const carriedIn = readCount(form.carriedIn, "carried-in")
  const payout = readCount(form.payout, "payout")
  if (!outlay.ok || !paidOut.ok || !carriedIn.ok || !payout.ok) return Err([outlay, paidOut, carriedIn, payout].flatMap(problemOf))
  const drawn = yenOf(decimal(BigInt(savingsDeductedFor(terms, Number(toPlainString(paidOut.value)))), 0), tokenValue)
  if (form.exchanged) {
    const handed = readCount(form.exchangedTokens, "exchanged-tokens")
    const special = readSpecialPrizes(form.specialPrizes)
    if (!handed.ok || !special.ok) return Err([handed, special].flatMap(problemOf))
    const odd = oddPrizesFor(handed.value, terms, special.value)
    return Ok({ outlay: add(add(outlay.value, drawn), yenOf(carriedIn.value, tokenValue)), takings: yenOf(handed.value, tokenValue), settlement: { type: "off-book-exchanged", cash: outlay.value, specialPrizes: special.value, oddPrizes: odd } })
  }
  return Ok({ outlay: add(add(outlay.value, drawn), yenOf(carriedIn.value, tokenValue)), takings: yenOf(payout.value, tokenValue), settlement: { type: "off-book-savings", cash: outlay.value } })
}

/** What the two sides come to, the takings less the outlay; none while they do not read. */
export const resultOfFinishYenTally = (form: FinishYenTallyForm, terms: PlayTerms | undefined): Decimal | undefined => {
  const sides = readSides(form, terms)
  return sides.ok ? subtract(sides.value.takings, sides.value.outlay) : undefined
}

/** The form read into a tally in yen at the parlor chosen, or none, or every field that could not be read. Whether the tally can be written is the core's to say afterwards. */
export const readFinishYenTallyForm = (form: FinishYenTallyForm, terms: PlayTerms | undefined, parlor: Parlor | undefined, id: PlayId): Result<YenTally, readonly FieldProblem[]> => {
  const date = parseIsoDate(form.date)
  const dateRead: Read<IsoDate> = date.ok ? date : Err({ field: "date", reason: "not-a-date" })
  const sides = readSides(form, terms)
  const theoreticalValue = readOptionalYen(form.theoreticalValue, "theoretical-value")
  if (!dateRead.ok || !sides.ok || !theoreticalValue.ok) return Err([...problemOf(dateRead), ...(sides.ok ? [] : sides.error), ...problemOf(theoreticalValue)])
  return Ok({
    id,
    date: dateRead.value,
    parlor,
    gameKind: form.gameKind,
    machine: form.machine,
    cabinetNumber: form.cabinetNumber.trim() === "" ? undefined : form.cabinetNumber,
    outlay: sides.value.outlay,
    takings: sides.value.takings,
    settlement: sides.value.settlement,
    theoreticalValue: theoreticalValue.value,
    told: undefined,
  })
}

/** The tokens in hand as the play finished, as typed: none where left empty or unread. */
export const heldIn = (form: Pick<FinishYenTallyForm, "payout">): number => {
  const plain = tidyTyped(form.payout).replaceAll(",", "")
  return COUNT.test(plain) ? Number(plain) : 0
}

const filled = (count: number | undefined): string => (count === undefined || count === 0 ? "" : String(count))

/**
 * The form filled in from a play followed live with no parlor: its words,
 * the cash it spent, the tokens it drew from savings, was begun with and had left, and its
 * theoretical value where there is one.
 */
export const finishYenTallyFormOf = (draft: PlayDraft, played: PlayedSoFar): FinishYenTallyForm => ({
  date: draft.date,
  gameKind: draft.gameKind,
  machine: draft.machine,
  cabinetNumber: draft.cabinetNumber ?? "",
  outlay: played.outlay === undefined ? "" : String(played.outlay),
  replayPaidOut: filled(played.replay),
  carriedIn: filled(played.carriedIn),
  payout: filled(played.held),
  takings: "",
  exchanged: false,
  exchangedTokens: "",
  specialPrizes: "",
  theoreticalValue: played.theoreticalValue === undefined ? "" : toPlainString(theoreticalDecimalOf(played.theoreticalValue)),
})
