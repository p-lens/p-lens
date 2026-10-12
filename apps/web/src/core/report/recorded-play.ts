import type { Posting, Transaction } from "../../hledger/protocol/wire"
import { YEN, tokenCommodity } from "../commodity/commodity"
import { ZERO, isNegative, isZero, negate, parseDecimal, subtract, sum, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, rentalSpreadAccount, savingsAccount } from "../journal/accounts"
import { identityIn, sameIdentity, type Parlor } from "../parlor/parlor"
import { PLAY_TAGS, tokenKindOf, type InferredWorth, type PlayHead, type PlayRecord, type PlayTold, type TalliedPlay } from "../play/play"
import { SOURCE_TAGS } from "../import/source-play"
import { decimalOfQuantity } from "./figures"
import { playSummaryOf } from "./plays"

/** A play as the book holds it, read back into what it was recorded from: in tokens at a parlor, or by its totals in yen. */
export type RecordedPlay = { readonly type: "at-parlor"; readonly record: PlayRecord } | { readonly type: "tallied"; readonly play: TalliedPlay }

/** One amount an entry posts: where, of what, and how much. */
interface Posted {
  readonly account: string
  readonly commodity: string
  readonly quantity: Decimal
}

const postedIn = (postings: readonly Posting[]): readonly Posted[] =>
  postings.flatMap((posting) => posting.pamount.map((amount) => ({ account: posting.paccount, commodity: amount.acommodity, quantity: decimalOfQuantity(amount.aquantity) })))

const at = (posted: readonly Posted[], account: string): Decimal => sum(posted.filter((each) => each.account === account).map((each) => each.quantity))

const same = (left: Decimal, right: Decimal): boolean => isZero(subtract(left, right))

/** Whether every amount posted is on one of these accounts, each in the commodity that account is kept in here. */
const keptTo = (posted: readonly Posted[], commodities: Readonly<Record<string, string>>): boolean => posted.every((each) => commodities[each.account] === each.commodity)

/** The parlor an entry's tags name, among the book's; `none` where they name none, undefined where they name one the book does not keep. */
const parlorOf = (transaction: Transaction, parlors: readonly Parlor[]): Parlor | "none" | undefined => {
  const identity = identityIn(transaction.ttags)
  return identity === undefined ? "none" : parlors.find((parlor) => sameIdentity(parlor.identity, identity))
}

/** The one statistic an entry may carry beside its money: its theoretical value, in yen. */
const statisticsStand = (transaction: Transaction): boolean =>
  keptTo(postedIn(transaction.tpostings.filter((posting) => posting.ptype !== "RegularPosting")), { [ACCOUNTS.theoreticalValue]: YEN, [ACCOUNTS.inferredTheoreticalValue]: YEN })

/**
 * A play in yen, read from its two sides: what its entry put to the play's
 * expense went in, and what it put to its revenue came back. An entry
 * written while a play in yen kept only its result has one side alone — a
 * loss all outlay, a gain all takings — and is read as that, as is one
 * written while a gain was put to cash. An entry with a side below nothing
 * was not written by a record, and is not read as one.
 */
const tagged = (transaction: Transaction, name: string): string | undefined => transaction.ttags.find(([tag]) => tag === name)?.[1].trim()

const countOf = (text: string | undefined): number | undefined => (text !== undefined && /^\d+$/.test(text) ? Number(text) : undefined)

const amountOf = (text: string | undefined): Decimal | undefined => ((read) => (read?.ok === true ? read.value : undefined))(text === undefined ? undefined : parseDecimal(text))

/** What an entry's tags say the play was taken to be worth, with what its inferred posting holds: none unless every part is there. */
const inferredOf = (transaction: Transaction, value: Decimal | undefined): InferredWorth | undefined => {
  const formulaId = tagged(transaction, PLAY_TAGS.inferredFormula)
  const tokenRental = amountOf(tagged(transaction, PLAY_TAGS.tokenRental))
  const tokenExchange = amountOf(tagged(transaction, PLAY_TAGS.tokenExchange))
  return value === undefined || formulaId === undefined || tokenRental === undefined || tokenExchange === undefined ? undefined : { value, formulaId, tokenRental, tokenExchange }
}

/** What an entry's tags say was told of its play: nothing unless they say its hours. */
const toldOf = (transaction: Transaction, inferredValue: Decimal | undefined): PlayTold | undefined => {
  const hours = amountOf(tagged(transaction, PLAY_TAGS.hours))
  return hours === undefined
    ? undefined
    : { hours, jackpots: countOf(tagged(transaction, PLAY_TAGS.jackpots)), inferred: inferredOf(transaction, inferredValue) }
}

const talliedOf = (head: PlayHead, real: readonly Posted[], parlor: Parlor | "none", told: PlayTold | undefined): RecordedPlay | undefined => {
  const outlay = at(real, ACCOUNTS.playExpense)
  const takings = negate(at(real, ACCOUNTS.playRevenue))
  return keptTo(real, { [ACCOUNTS.cash]: YEN, [ACCOUNTS.playExpense]: YEN, [ACCOUNTS.playRevenue]: YEN, [ACCOUNTS.specialPrizes]: YEN, [ACCOUNTS.translationAdjustment]: YEN }) && !isNegative(outlay) && !isNegative(takings)
    ? { type: "tallied", play: { ...head, parlor: parlor === "none" ? undefined : parlor, outlay, takings, told } }
    : undefined
}

/**
 * A play in tokens, worked back from what its entry moved. Savings lose
 * what a replay took and gain what was left, so a replay took what was left
 * less what savings came to hold more; it paid out that less its fee, and
 * the tokens rented are the rest of what was spent — each but for the
 * tokens carried in, which the entry's tag counts, since they leave savings
 * and are spent as a replay's do. The pool is the one of
 * the parlor's whose tokens the entry is in: a play of cash alone that left
 * nothing touches no savings account to say it.
 *
 * An entry written before rented tokens stopped passing through savings
 * puts them in and takes them out again, which comes to the same counts,
 * and is read as what it was recorded from. An entry these do not add up
 * for was not written by a record, and is not read as one.
 */
const atParlorOf = (head: PlayHead, real: readonly Posted[], commodity: string, parlor: Parlor, carriedIn: Decimal): RecordedPlay | undefined => {
  const pool = parlor.pools.find((kept) => tokenCommodity(kept.kind, parlor.name, kept.tier) === commodity)
  if (pool === undefined || tokenKindOf(head.gameKind) !== pool.kind) return undefined
  const account = savingsAccount(pool.kind, parlor.name, pool.tier)
  const kept = keptTo(real, {
    [ACCOUNTS.cash]: YEN,
    [rentalSpreadAccount(pool.kind)]: YEN,
    [account]: commodity,
    [ACCOUNTS.playExpense]: commodity,
    [ACCOUNTS.replayFee]: commodity,
    [ACCOUNTS.playRevenue]: commodity,
  })
  if (!kept) return undefined
  const moved = real.filter((each) => each.account === account).map((each) => each.quantity)
  const outlay = negate(at(real, ACCOUNTS.cash))
  const payout = negate(at(real, ACCOUNTS.playRevenue))
  const passedThrough = subtract(sum(moved.filter((quantity) => !isNegative(quantity))), payout)
  const deducted = subtract(subtract(payout, sum(moved)), carriedIn)
  const paidOut = subtract(deducted, at(real, ACCOUNTS.replayFee))
  const tokens = subtract(subtract(at(real, ACCOUNTS.playExpense), paidOut), carriedIn)
  const adds = [outlay, payout, tokens, paidOut, carriedIn, subtract(deducted, paidOut)].every((count) => !isNegative(count)) && (isZero(passedThrough) || same(passedThrough, tokens)) && isZero(outlay) === isZero(tokens)
  return adds ? { type: "at-parlor", record: { ...head, parlor, pool: { kind: pool.kind, tier: pool.tier }, rental: isZero(tokens) ? undefined : { outlay, tokens }, replay: { paidOut, deducted }, carriedIn, payout } } : undefined
}

/** The tokens an entry's tag says were carried in: none where it has no such tag, undefined where the tag does not read as a count. */
const carriedInOf = (transaction: Transaction): Decimal | undefined => {
  const said = transaction.ttags.find(([name]) => name === PLAY_TAGS.carriedIn)?.[1]
  if (said === undefined) return ZERO
  const read = parseDecimal(said.trim())
  return read.ok ? read.value : undefined
}

/** Whether an entry was taken in from another app: it keeps what that app called things, which no form holds. */
const isImported = (transaction: Transaction): boolean => transaction.ttags.some(([name]) => name === SOURCE_TAGS.from)

/**
 * The play an entry records, read back into what a form recorded it from;
 * undefined for an entry no form wrote — one taken in from another app, one
 * changed by hand into postings a record does not make, or one naming a
 * parlor the book does not keep. Such a
 * play is still the book's, and is put right where it is written.
 */
export const recordedPlayOf = (transaction: Transaction, parlors: readonly Parlor[]): RecordedPlay | undefined => {
  const summary = playSummaryOf(transaction)
  const parlor = parlorOf(transaction, parlors)
  if (summary === undefined || summary.gameKind === undefined || parlor === undefined || !statisticsStand(transaction) || isImported(transaction)) return undefined
  const head: PlayHead = { id: summary.id, date: summary.date, gameKind: summary.gameKind, machine: summary.machine ?? "", cabinetNumber: summary.cabinetNumber, theoreticalValue: summary.theoreticalValue }
  const real = postedIn(transaction.tpostings.filter((posting) => posting.ptype === "RegularPosting"))
  const [commodity, ...others] = [...new Set(real.map((each) => each.commodity).filter((each) => each !== YEN))]
  if (commodity === undefined) return talliedOf(head, real, parlor, toldOf(transaction, summary.inferredValue))
  const carriedIn = carriedInOf(transaction)
  return others.length > 0 || parlor === "none" || carriedIn === undefined ? undefined : atParlorOf(head, real, commodity, parlor, carriedIn)
}
