import type { Posting, Transaction } from "../../hledger/protocol/wire"
import { YEN, tokenCommodity } from "../commodity/commodity"
import { ZERO, isNegative, isZero, negate, parseDecimal, subtract, sum, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, rentalSpreadAccount, savingsAccount } from "../journal/accounts"
import { identityIn, sameIdentity, type Parlor } from "../parlor/parlor"
import { PLAY_TAGS, tokenKindOf, type PlayHead, type PlayRecord, type TalliedPlay } from "../play/play"
import { SOURCE_TAGS } from "../import/source-play"
import { decimalOfQuantity } from "./figures"
import { playSummaryOf } from "./plays"

/** A play as the book holds it, read back into what it was recorded from: in tokens at a parlor, or by its result in yen. */
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
  keptTo(postedIn(transaction.tpostings.filter((posting) => posting.ptype !== "RegularPosting")), { [ACCOUNTS.theoreticalValue]: YEN })

const talliedOf = (head: PlayHead, real: readonly Posted[], parlor: Parlor | "none"): RecordedPlay | undefined =>
  keptTo(real, { [ACCOUNTS.cash]: YEN, [ACCOUNTS.playExpense]: YEN, [ACCOUNTS.playRevenue]: YEN })
    ? { type: "tallied", play: { ...head, parlor: parlor === "none" ? undefined : parlor, result: at(real, ACCOUNTS.cash) } }
    : undefined

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

/** Whether an entry was taken in from another app: it keeps both sides of its result and what that app called things, none of which a form holds. */
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
  if (commodity === undefined) return talliedOf(head, real, parlor)
  const carriedIn = carriedInOf(transaction)
  return others.length > 0 || parlor === "none" || carriedIn === undefined ? undefined : atParlorOf(head, real, commodity, parlor, carriedIn)
}
