import type { Posting, Transaction } from "../../hledger/protocol/wire"
import { YEN } from "../commodity/commodity"
import { isNegative, isZero, negate, subtract, sum, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, readSavingsAccount, rentalSpreadAccount } from "../journal/accounts"
import { identityIn, sameIdentity, samePool, type Parlor } from "../parlor/parlor"
import { tokenKindOf, type PlayHead, type PlayRecord, type TalliedPlay } from "../play/play"
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
 * A play in tokens, worked back from what its entry moved. Savings gain
 * what was rented and what was left; they lose what was rented and what a
 * replay took. Revenue is what was left, the expense what was rented and
 * what a replay paid out. So the tokens rented are the gains less the
 * revenue, and the replay's two counts follow. An entry these do not add
 * up for was not written by a record, and is not read as one.
 */
const atParlorOf = (head: PlayHead, real: readonly Posted[], account: string, parlor: Parlor): RecordedPlay | undefined => {
  const savings = readSavingsAccount(account)
  const commodity = real.find((each) => each.account === account)?.commodity
  if (savings === undefined || commodity === undefined) return undefined
  const pool = { kind: savings.kind, tier: savings.tier }
  if (parlor.name !== savings.parlorName || !parlor.pools.some((kept) => samePool(kept, pool)) || tokenKindOf(head.gameKind) !== pool.kind) return undefined
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
  const gained = sum(moved.filter((quantity) => !isNegative(quantity)))
  const drawn = negate(sum(moved.filter(isNegative)))
  const outlay = negate(at(real, ACCOUNTS.cash))
  const payout = negate(at(real, ACCOUNTS.playRevenue))
  const tokens = subtract(gained, payout)
  const paidOut = subtract(at(real, ACCOUNTS.playExpense), tokens)
  const deducted = subtract(drawn, tokens)
  const adds = [outlay, payout, tokens, paidOut, deducted].every((count) => !isNegative(count)) && same(at(real, ACCOUNTS.replayFee), subtract(deducted, paidOut)) && isZero(outlay) === isZero(tokens)
  return adds ? { type: "at-parlor", record: { ...head, parlor, pool, rental: isZero(tokens) ? undefined : { outlay, tokens }, replay: { paidOut, deducted }, payout } } : undefined
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
  const accounts = [...new Set(real.map((each) => each.account).filter((account) => readSavingsAccount(account) !== undefined))]
  const [account, ...others] = accounts
  if (account === undefined) return talliedOf(head, real, parlor)
  return others.length > 0 || parlor === "none" ? undefined : atParlorOf(head, real, account, parlor)
}
