import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { ZERO, add, decimal, isZero, parseDecimal, subtract, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import type { PlayDraft } from "../../../core/live-play/draft"
import type { Parlor } from "../../../core/parlor/parlor"
import { savingsDeductedFor, tokensRentedFor, tokenValueOf, type PlayTerms } from "../../../core/parlor/terms"
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
  readonly theoreticalValue: string
}

/** An outlay must be given: a play that cost nothing is typed as 0, not left out. */
const readOutlay = (text: string): Read<Decimal> => {
  if (tidyTyped(text) === "") return Err({ field: "outlay", reason: "required" })
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field: "outlay", reason: "not-a-number" })
}

/** Yen left empty are none. */
const readTakings = (text: string): Read<Decimal> => {
  if (tidyTyped(text) === "") return Ok(ZERO)
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field: "takings", reason: "not-a-number" })
}

const COUNT = /^\d+$/

/** Tokens counted: a whole number, none where left empty. */
const readCount = (text: string, field: "replay-paid-out" | "carried-in" | "payout"): Read<Decimal> => {
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
 * the cash spent alone. With none: the cash spent, and the yen typed as
 * come back, the prizes taken home.
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
  theoreticalValue: played.theoreticalValue === undefined ? "" : toPlainString(theoreticalDecimalOf(played.theoreticalValue)),
})
