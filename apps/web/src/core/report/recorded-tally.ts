import type { Posting, Transaction } from "../../hledger/protocol/wire"
import { YEN, tokenCommodity } from "../commodity/commodity"
import { ZERO, isNegative, isZero, negate, parseDecimal, subtract, sum, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, offBookSavingsAccount, rentalSpreadAccount, savingsAccount } from "../journal/accounts"
import { PARLOR_ID_TAG, PARLOR_SUBMISSION_TAG, identityIn, sameIdentity, type Parlor } from "../parlor/parlor"
import { TALLY_TAGS, type InferredWorth, type Settlement, type TallyHead, type TokenTally, type TallyTold, type YenTally } from "../tally/tally"
import { tokenKindOf } from "../play/play"
import { SOURCE_TAGS } from "../import/source-tally"
import { asideOf, withAside } from "../tally/aside"
import { readClockText } from "../tally/clock"
import { decimalOfQuantity } from "./figures"
import { tallySummaryOf } from "./tallies"

/** A tally as the book holds it, read back into what it was recorded from: in tokens at a parlor, or by its totals in yen. */
export type RecordedTally = { readonly type: "token"; readonly tally: TokenTally } | { readonly type: "yen"; readonly tally: YenTally }

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
export const statisticsStand = (transaction: Transaction): boolean =>
  keptTo(postedIn(transaction.tpostings.filter((posting) => posting.ptype !== "RegularPosting")), { [ACCOUNTS.theoreticalValue]: YEN, [ACCOUNTS.inferredTheoreticalValue]: YEN })

/**
 * A tally in yen, read from its two sides: what its entry put to the
 * play's expense went in, and what it put to its revenue came back. An entry
 * written while a tally in yen kept only its result has one side alone — a
 * loss all outlay, a gain all takings — and is read as that, as is one
 * written while a gain was put to cash. An entry with a side below nothing
 * was not written by a form, and is not read as one.
 */
const tagged = (transaction: Transaction, name: string): string | undefined => transaction.ttags.find(([tag]) => tag === name)?.[1].trim()

const countOf = (text: string | undefined): number | undefined => (text !== undefined && /^\d+$/.test(text) ? Number(text) : undefined)

const amountOf = (text: string | undefined): Decimal | undefined => ((read) => (read?.ok === true ? read.value : undefined))(text === undefined ? undefined : parseDecimal(text))

/** What an entry's tags say its play was taken to be worth, with what its inferred posting holds: none unless every part is there. */
const inferredOf = (transaction: Transaction, value: Decimal | undefined): InferredWorth | undefined => {
  const formulaId = tagged(transaction, TALLY_TAGS.inferredFormula)
  const tokenRental = amountOf(tagged(transaction, TALLY_TAGS.tokenRental))
  const tokenExchange = amountOf(tagged(transaction, TALLY_TAGS.tokenExchange))
  return value === undefined || formulaId === undefined || tokenRental === undefined || tokenExchange === undefined
    ? undefined
    : { value, formulaId, tokenRental, tokenExchange, spinPerformance: amountOf(tagged(transaction, TALLY_TAGS.inferredSpinPerformance)) }
}

/** What an entry's tags say was told of its play: nothing unless they say its hours or what it was inferred to be worth. */
const toldOf = (transaction: Transaction, inferredValue: Decimal | undefined): TallyTold | undefined => {
  const hours = amountOf(tagged(transaction, TALLY_TAGS.hours))
  const inferred = inferredOf(transaction, inferredValue)
  return hours === undefined && inferred === undefined ? undefined : { hours, jackpots: hours === undefined ? undefined : countOf(tagged(transaction, TALLY_TAGS.jackpots)), inferred }
}

/**
 * How a tally in yen's two sides were settled, as its entry says: against
 * savings the book does not keep where it posts to them; in cash and
 * prizes where it takes all its outlay from cash and puts all its takings
 * to prizes, both; and unknown otherwise — an entry that wrote only what
 * lay between, which is what an entry settled either way and coming to
 * nothing else would write too, and is read back as the same entry.
 */
const settlementOf = (real: readonly Posted[], offBook: string, outlay: Decimal, takings: Decimal): Settlement | undefined => {
  const cash = negate(at(real, ACCOUNTS.cash))
  if (!isZero(at(real, offBook))) return { type: "off-book-savings", cash }
  const prizes = sum([at(real, ACCOUNTS.specialPrizes), at(real, ACCOUNTS.translationAdjustment)])
  return !isZero(cash) && !isZero(prizes) && isZero(subtract(cash, outlay)) && isZero(subtract(prizes, takings)) ? { type: "cash-and-prizes" } : undefined
}

const yenTallyOf = (head: TallyHead, real: readonly Posted[], parlor: Parlor | "none", told: TallyTold | undefined): RecordedTally | undefined => {
  const offBook = offBookSavingsAccount(tokenKindOf(head.gameKind))
  const outlay = at(real, ACCOUNTS.playExpense)
  const takings = negate(at(real, ACCOUNTS.playRevenue))
  return keptTo(real, { [ACCOUNTS.cash]: YEN, [ACCOUNTS.playExpense]: YEN, [ACCOUNTS.playRevenue]: YEN, [ACCOUNTS.specialPrizes]: YEN, [ACCOUNTS.translationAdjustment]: YEN, [offBook]: YEN }) && !isNegative(outlay) && !isNegative(takings)
    ? { type: "yen", tally: { ...head, parlor: parlor === "none" ? undefined : parlor, outlay, takings, settlement: settlementOf(real, offBook, outlay, takings), told } }
    : undefined
}

/**
 * A tally in tokens, worked back from what its entry moved. Savings lose
 * what a replay took and gain what was left, so a replay took what was left
 * less what savings came to hold more; it paid out that less its fee, and
 * the tokens rented are the rest of what was spent — each but for the
 * tokens carried in, which the entry's tag counts, since they leave savings
 * and are spent as a replay's do. The pool is the one of
 * the parlor's whose tokens the entry is in: a tally of cash alone that left
 * nothing touches no savings account to say it.
 *
 * An entry written before rented tokens stopped passing through savings
 * puts them in and takes them out again, which comes to the same counts,
 * and is read as what it was recorded from. An entry these do not add up
 * for was not written by a form, and is not read as one.
 */
const tokenTallyOf = (head: TallyHead, real: readonly Posted[], commodity: string, parlor: Parlor, carriedIn: Decimal): RecordedTally | undefined => {
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
  return adds ? { type: "token", tally: { ...head, parlor, pool: { kind: pool.kind, tier: pool.tier }, rental: isZero(tokens) ? undefined : { outlay, tokens }, replay: { paidOut, deducted }, carriedIn, payout } } : undefined
}

/** The tokens an entry's tag says were carried in: none where it has no such tag, undefined where the tag does not read as a count. */
const carriedInOf = (transaction: Transaction): Decimal | undefined => {
  const said = transaction.ttags.find(([name]) => name === TALLY_TAGS.carriedIn)?.[1]
  if (said === undefined) return ZERO
  const read = parseDecimal(said.trim())
  return read.ok ? read.value : undefined
}

const isSaid = (text: string): boolean => text !== ""

const isAmount = (text: string): boolean => parseDecimal(text).ok

const isTime = (text: string): boolean => readClockText(text) !== undefined

/** How each tag a form writes on a tally's entry must read; a tag not here is none a form writes. */
const TAG_READS: Readonly<Record<string, (text: string) => boolean>> = {
  [TALLY_TAGS.playId]: isSaid,
  [TALLY_TAGS.gameKind]: (text) => text === "pachinko" || text === "slot",
  [TALLY_TAGS.machine]: () => true,
  [TALLY_TAGS.cabinetNumber]: () => true,
  [TALLY_TAGS.started]: isTime,
  [TALLY_TAGS.finished]: isTime,
  [TALLY_TAGS.spinPerformance]: isAmount,
  [TALLY_TAGS.carriedIn]: isAmount,
  [TALLY_TAGS.hours]: isAmount,
  [TALLY_TAGS.jackpots]: (text) => /^\d+$/.test(text),
  [TALLY_TAGS.inferredFormula]: isSaid,
  [TALLY_TAGS.tokenRental]: isAmount,
  [TALLY_TAGS.tokenExchange]: isAmount,
  [TALLY_TAGS.inferredSpinPerformance]: isAmount,
  [TALLY_TAGS.senderId]: isSaid,
  [TALLY_TAGS.sender]: () => true,
  [PARLOR_ID_TAG]: isSaid,
  [PARLOR_SUBMISSION_TAG]: isSaid,
}

/**
 * Whether every tag on an entry is one a form writes, reading as a form
 * writes it. A form set right writes its entry anew from what it read, so
 * a tag it would not read back — one added by hand, or one whose value was
 * changed into something else — would be lost without a word.
 */
const tagsRead = (transaction: Transaction): boolean => transaction.ttags.every(([name, value]) => TAG_READS[name]?.(value.trim()) === true)

/** The tags on an entry that a form writes and that do not read as a form writes them, by name: a tag no form writes is not among them. */
export const unreadableTagsOf = (transaction: Transaction): readonly string[] =>
  transaction.ttags.flatMap(([name, value]) => (TAG_READS[name] !== undefined && TAG_READS[name](value.trim()) !== true ? [name] : []))

/** Whether an entry was taken in from another app: it keeps what that app called things, which no form holds. */
const isImported = (transaction: Transaction): boolean => transaction.ttags.some(([name]) => name === SOURCE_TAGS.from)

/**
 * The tally an entry records, read back into what a form recorded it from;
 * undefined for an entry no form wrote — one taken in from another app, one
 * changed by hand into postings or tags a form does not make, or one naming a
 * parlor the book does not keep. Such a
 * tally is still the book's, and is put right where it is written.
 */
export const recordedTallyOf = (transaction: Transaction, parlors: readonly Parlor[]): RecordedTally | undefined => {
  const summary = tallySummaryOf(transaction)
  const parlor = parlorOf(transaction, parlors)
  if (summary === undefined || summary.gameKind === undefined || parlor === undefined || !statisticsStand(transaction) || isImported(transaction) || !tagsRead(transaction)) return undefined
  const head = withAside<TallyHead>({ id: summary.id, date: summary.date, gameKind: summary.gameKind, machine: summary.machine ?? "", cabinetNumber: summary.cabinetNumber, theoreticalValue: summary.theoreticalValue }, asideOf((name) => tagged(transaction, name)))
  const real = postedIn(transaction.tpostings.filter((posting) => posting.ptype === "RegularPosting"))
  const [commodity, ...others] = [...new Set(real.map((each) => each.commodity).filter((each) => each !== YEN))]
  if (commodity === undefined) return yenTallyOf(head, real, parlor, toldOf(transaction, summary.inferredValue))
  const carriedIn = carriedInOf(transaction)
  return others.length > 0 || parlor === "none" || carriedIn === undefined ? undefined : tokenTallyOf(head, real, commodity, parlor, carriedIn)
}
