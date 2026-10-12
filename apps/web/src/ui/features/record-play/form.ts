import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { tokenCommodity, type TokenKind } from "../../../core/commodity/commodity"
import { ZERO, decimal, isZero, parseDecimal, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import type { PlayDraft } from "../../../core/live-play/draft"
import { samePool, type Parlor, type SavingsPool } from "../../../core/parlor/parlor"
import { exchangeRateOf, poolOf, savingsDeductedFor, tokensRentedFor, type PlayTerms } from "../../../core/parlor/terms"
import type { PlayGameKind, NumericField, PlayId, PlayRecord } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import { rateOn, rateReachingBack, type PricePoint } from "../../../core/valuation/valuation"

/**
 * The record form for a play at a parlor, as typed: every field text, nothing
 * yet read. Where it was played and on what terms are the play's, not the
 * form's; the tokens rented and the savings a replay took follow from them,
 * and are typed only where the play has nothing to work them out by.
 */
export interface PlayForm {
  readonly date: string
  readonly machine: string
  readonly cabinetNumber: string
  readonly outlay: string
  /** The tokens the outlay rented, read only where the play's rental is not known. */
  readonly rentalTokens: string
  readonly replayPaidOut: string
  /** The savings the replay took, read only where the play's replay is not known; left empty, a replay took what it paid out. */
  readonly replayDeducted: string
  /** The tokens in hand as the play began, brought from the play before. */
  readonly carriedIn: string
  readonly payout: string
  readonly theoreticalValue: string
}

export type FormField = "date" | "parlor" | NumericField

export interface FieldProblem {
  readonly field: FormField
  readonly reason: "required" | "not-a-number" | "not-a-date"
}

/**
 * Where a play at a parlor was played and what its sums are counted by:
 * the pool it draws on, what a sum of yen rents and what a replay takes —
 * each where it is known — and what its tokens exchange for on a day.
 */
export interface PlayedAt {
  readonly parlor: Parlor
  readonly gameKind: PlayGameKind
  readonly pool: SavingsPool
  /** What a sum of yen rents; none where the tokens rented are typed beside the outlay. */
  readonly rental: PlayTerms["rental"] | undefined
  /** What a replay takes off savings for what it pays out; none where both are typed. */
  readonly replay: PlayTerms["replay"] | undefined
  /** Yen a token exchanges for on a day, where that is known. */
  readonly exchangeRateOn: (date: IsoDate) => Decimal | undefined
}

/**
 * A play being recorded, on the terms of the corner it was played at. The
 * parlor is said to have the pool those terms make, whatever it had when
 * the play began: the pool is opened in the book as the play is recorded.
 */
export const playedOnTerms = (parlor: Parlor, terms: PlayTerms, gameKind: PlayGameKind): PlayedAt => ({
  parlor: parlor.pools.some((pool) => samePool(pool, poolOf(gameKind, terms))) ? parlor : { ...parlor, pools: [...parlor.pools, poolOf(gameKind, terms)] },
  gameKind,
  pool: poolOf(gameKind, terms),
  rental: terms.rental,
  replay: terms.replay,
  exchangeRateOn: () => exchangeRateOf(terms),
})

/** A count as a plain number, for the terms' arithmetic; a fraction is the core's to refuse, so it passes through. */
const countOf = (value: Decimal): number => Number(value.mantissa) / 10 ** value.places

/**
 * A recorded play being set right, counted as it was recorded: the book
 * keeps no corner's terms, but the play's own entry says what its outlay
 * rented and what its replay took, and a sum typed anew is counted in the
 * same proportion. A play that rented nothing, or replayed nothing, has no
 * proportion to give, and that count is typed. Its tokens exchange at the
 * book's rate for the day, or at the pool's first where the day is before
 * any rate the book has.
 */
export const playedAsRecorded = (record: PlayRecord, prices: readonly PricePoint[]): PlayedAt => ({
  parlor: record.parlor,
  gameKind: record.gameKind,
  pool: record.pool,
  rental: record.rental === undefined ? undefined : { yen: countOf(record.rental.outlay), tokens: countOf(record.rental.tokens) },
  replay: isZero(record.replay.paidOut) ? undefined : { paidOut: countOf(record.replay.paidOut), deducted: countOf(record.replay.deducted) },
  exchangeRateOn: (date) => {
    const commodity = tokenCommodity(record.pool.kind, record.parlor.name, record.pool.tier)
    return (rateOn(prices, commodity, date) ?? rateReachingBack(prices, commodity, date))?.rate
  },
})

/**
 * The book's prices as they will stand when a play of a day is written:
 * with the rate the play is counted at on that day, where there is one. A
 * play at a pool the book does not keep yet has its rate from its terms
 * alone until it is recorded — the pool is opened then — and what the form
 * shows of the entry is composed on these, not on a book that has yet to
 * hear of the pool.
 */
export const pricesPlayedAt = (at: PlayedAt, date: IsoDate, prices: readonly PricePoint[]): readonly PricePoint[] => {
  const rate = at.exchangeRateOn(date)
  return rate === undefined ? prices : [...prices, { date, commodity: tokenCommodity(at.pool.kind, at.parlor.name, at.pool.tier), rate }]
}

type Read<T> = Result<T, FieldProblem>

/** A number left empty is zero: nothing was rented, nothing replayed. */
const readCount = (text: string, field: NumericField): Read<Decimal> => {
  if (tidyTyped(text) === "") return Ok(ZERO)
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field, reason: "not-a-number" })
}

/** A theoretical figure left empty was not worked out, which is not the same as zero. */
export const readOptionalYen = (text: string, field: NumericField): Read<Decimal | undefined> => {
  if (tidyTyped(text) === "") return Ok(undefined)
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field, reason: "not-a-number" })
}

const problemOf = (read: Read<unknown>): readonly FieldProblem[] => (read.ok ? [] : [read.error])

const whole = (value: number): Decimal => decimal(BigInt(value), 0)

/** Tokens the outlay rented: worked out where the play's rental is known, read as typed where it is not. */
const readRented = (form: PlayForm, at: PlayedAt, outlay: Decimal): Read<Decimal> =>
  at.rental === undefined ? readCount(form.rentalTokens, "rental-tokens") : Ok(whole(tokensRentedFor({ rental: at.rental }, countOf(outlay))))

/** Savings a replay took: worked out where the play's replay is known; where it is not, read as typed, and what it paid out when left empty. */
const readDeducted = (form: PlayForm, at: PlayedAt, paidOut: Decimal): Read<Decimal> => {
  if (at.replay !== undefined) return Ok(whole(savingsDeductedFor({ replay: at.replay }, countOf(paidOut))))
  return tidyTyped(form.replayDeducted) === "" ? Ok(paidOut) : readCount(form.replayDeducted, "replay-deducted")
}

/**
 * The form read into a play record, or every field that could not be read.
 * Whether the record makes sense as a play is the core's to say afterwards.
 */
export const readPlayForm = (form: PlayForm, at: PlayedAt, id: PlayId): Result<PlayRecord, readonly FieldProblem[]> => {
  const date = parseIsoDate(form.date)
  const dateRead: Read<IsoDate> = date.ok ? date : Err({ field: "date", reason: "not-a-date" })
  const outlay = readCount(form.outlay, "outlay")
  const paidOut = readCount(form.replayPaidOut, "replay-paid-out")
  const carriedIn = readCount(form.carriedIn, "carried-in")
  const payout = readCount(form.payout, "payout")
  const theoreticalValue = readOptionalYen(form.theoreticalValue, "theoretical-value")
  const rented = outlay.ok ? readRented(form, at, outlay.value) : Ok(ZERO)
  const deducted = paidOut.ok ? readDeducted(form, at, paidOut.value) : Ok(ZERO)
  if (!dateRead.ok || !outlay.ok || !rented.ok || !paidOut.ok || !deducted.ok || !carriedIn.ok || !payout.ok || !theoreticalValue.ok)
    return Err([dateRead, outlay, rented, paidOut, deducted, carriedIn, payout, theoreticalValue].flatMap(problemOf))
  return Ok({
    id,
    date: dateRead.value,
    parlor: at.parlor,
    pool: at.pool,
    gameKind: at.gameKind,
    machine: form.machine,
    cabinetNumber: form.cabinetNumber.trim() === "" ? undefined : form.cabinetNumber,
    rental: isZero(outlay.value) && isZero(rented.value) ? undefined : { outlay: outlay.value, tokens: rented.value },
    replay: { paidOut: paidOut.value, deducted: deducted.value },
    carriedIn: carriedIn.value,
    payout: payout.value,
    theoreticalValue: theoreticalValue.value,
  })
}

/** What a play followed live comes to by its log, for recording it: yen spent, tokens drawn from savings, the tokens it was begun with in hand, the tokens in hand at its last line, and its theoretical value, each where the log says. */
export interface PlayedSoFar {
  readonly outlay: number | undefined
  readonly replay: number | undefined
  readonly carriedIn: number | undefined
  readonly held: number | undefined
  readonly theoreticalValue: number | undefined
}

const filled = (count: number | undefined): string => (count === undefined || count === 0 ? "" : String(count))

/**
 * The form filled in from a play followed live at a parlor, for recording it:
 * its outlay, what it drew from savings — the fee that took follows from the
 * corner's terms, as ever — the tokens it was begun with in hand, the tokens counted in hand at its last line as
 * what it leaves, and the theoretical value its formula comes to
 * at the spin performance measured, where there is one.
 */
export const formFromDraft = (draft: PlayDraft, played: PlayedSoFar): PlayForm => ({
  date: draft.date,
  machine: draft.machine,
  cabinetNumber: draft.cabinetNumber ?? "",
  outlay: filled(played.outlay),
  rentalTokens: "",
  replayPaidOut: filled(played.replay),
  replayDeducted: "",
  carriedIn: filled(played.carriedIn),
  payout: filled(played.held),
  theoreticalValue: played.theoreticalValue === undefined ? "" : String(Math.round(played.theoreticalValue)),
})

const countText = (count: Decimal): string => (isZero(count) ? "" : toPlainString(count))

/** The form filled in from a recorded play, for setting it right: every sum as its entry has it. */
export const formOfRecord = (record: PlayRecord): PlayForm => ({
  date: record.date,
  machine: record.machine,
  cabinetNumber: record.cabinetNumber ?? "",
  outlay: countText(record.rental?.outlay ?? ZERO),
  rentalTokens: countText(record.rental?.tokens ?? ZERO),
  replayPaidOut: countText(record.replay.paidOut),
  replayDeducted: countText(record.replay.deducted),
  carriedIn: countText(record.carriedIn),
  payout: countText(record.payout),
  theoreticalValue: record.theoreticalValue === undefined ? "" : toPlainString(record.theoreticalValue),
})

/** What the tokens in hand are called where they are typed, for each kind of token: those a play was begun with — brought from the play before — and those in hand as it ended, which are what it leaves. */
export const IN_HAND_LABELS: Readonly<Record<TokenKind, { readonly carriedIn: string; readonly left: string }>> = {
  ball: { carriedIn: "開始時の持ち玉", left: "持ち玉" },
  medal: { carriedIn: "開始時の持ちメダル", left: "持ちメダル" },
}

/** What a form's button says, and says while it is at work: a play being recorded, or a recorded one being set right. */
export interface SubmitWords {
  readonly idle: string
  readonly busy: string
}

export const RECORDING: SubmitWords = { idle: "記録する", busy: "記録中…" }

export const REVISING: SubmitWords = { idle: "保存する", busy: "保存中…" }

/** A play of the day the book already has, recorded again from its readings as they now are. */
export const RECORDING_AGAIN: SubmitWords = { idle: "記帳し直す", busy: "記帳中…" }
