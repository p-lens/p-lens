import { YEN, tokenCommodity, type TokenKind } from "../commodity/commodity"
import { ZERO, add, isNegative, isZero, multiply, negate, subtract, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, rentalSpreadAccount, savingsAccount } from "../journal/accounts"
import type { Entry, Posting } from "../journal/entry"
import { Err, Ok, andThen, mapOk, type Result } from "../result/result"
import { theoreticalValuePosting } from "../theoretical/theoretical"
import { rateOn, type PricePoint } from "../valuation/valuation"
import { identityTags, type Parlor } from "../parlor/parlor"
import { PLAY_TAGS, type PlayError, type PlayHead, type PlayRecord, type Rental, type Replay, type TalliedPlay } from "./play"
import { validatePlay, validateTalliedPlay } from "./validate"

const real = (account: string, quantity: Decimal, commodity: string): Posting => ({
  account,
  amount: { quantity, commodity },
  kind: "real",
})

/** Leave out a pair of postings that would move nothing. */
const unlessZero = (quantity: Decimal, postings: readonly Posting[]): readonly Posting[] =>
  isZero(quantity) ? [] : postings

/**
 * Renting tokens, split at the moment of renting into what the tokens are
 * worth at that day's exchange rate and the spread lost on top of it.
 *
 * ¥12,000 for 3,000 balls exchanged at ¥3.57 is ¥10,710 of balls and a ¥1,290
 * loss, settled that day. A later change of rate moves what the balls are
 * worth and never this loss.
 */
/** Where a play's tokens are kept and what they are: the parlor's savings of one pool. */
interface Holding {
  readonly account: string
  readonly commodity: string
  readonly kind: TokenKind
}

const holdingOf = (record: PlayRecord): Holding => ({
  account: savingsAccount(record.pool.kind, record.parlor.name, record.pool.tier),
  commodity: tokenCommodity(record.pool.kind, record.parlor.name, record.pool.tier),
  kind: record.pool.kind,
})

const rentalPostings = (rental: Rental, rate: Decimal, holding: Holding): readonly Posting[] => {
  const spread = subtract(rental.outlay, multiply(rental.tokens, rate))
  return unlessZero(rental.tokens, [
    real(ACCOUNTS.cash, negate(rental.outlay), YEN),
    ...unlessZero(spread, [real(rentalSpreadAccount(holding.kind), spread, YEN)]),
    { ...real(holding.account, rental.tokens, holding.commodity), cost: { rate, commodity: YEN } },
  ])
}

/**
 * Shooting tokens: out of savings and spent — every rented one, and every one
 * a replay paid out, with the replay's fee taken off savings beside them.
 * Counted in tokens only; what that comes to in yen is hledger's to say, at
 * the rate of the day it is asked about.
 */
const shotPostings = (rented: Decimal, replay: Replay, holding: Holding): readonly Posting[] => {
  const fee = subtract(replay.deducted, replay.paidOut)
  return [
    ...unlessZero(add(rented, replay.deducted), [real(holding.account, negate(add(rented, replay.deducted)), holding.commodity)]),
    ...unlessZero(add(rented, replay.paidOut), [real(ACCOUNTS.playExpense, add(rented, replay.paidOut), holding.commodity)]),
    ...unlessZero(fee, [real(ACCOUNTS.replayFee, fee, holding.commodity)]),
  ]
}

/** Tokens left at the end, earned by the play and put into savings. */
const payoutPostings = (payout: Decimal, holding: Holding): readonly Posting[] =>
  unlessZero(payout, [real(holding.account, payout, holding.commodity), real(ACCOUNTS.playRevenue, negate(payout), holding.commodity)])

const rentedTokens = (record: PlayRecord): Decimal => record.rental?.tokens ?? ZERO

/**
 * The exchange rate a rental is split at, if the record rents anything.
 * `undefined` inside `Ok` means there is no rental to split.
 */
const rentalRate = (record: PlayRecord, prices: readonly PricePoint[]): Result<Decimal | undefined, PlayError> => {
  if (record.rental === undefined || isZero(record.rental.tokens)) return Ok(undefined)
  const commodity = tokenCommodity(record.pool.kind, record.parlor.name, record.pool.tier)
  const point = rateOn(prices, commodity, record.date)
  return point === undefined ? Err({ type: "no-exchange-rate", commodity, date: record.date }) : Ok(point.rate)
}

const describe = (record: PlayHead, parlor: Parlor | undefined): string =>
  [parlor?.name, record.machine.trim(), record.cabinetNumber === undefined ? undefined : `${record.cabinetNumber.trim()}番台`]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" ")

const tagsOf = (record: PlayHead, parlor: Parlor | undefined): Entry["tags"] => [
  [PLAY_TAGS.playId, record.id],
  ...(parlor === undefined ? [] : identityTags(parlor.identity)),
  [PLAY_TAGS.gameKind, record.gameKind],
  ...(record.machine.trim() === "" ? [] : [[PLAY_TAGS.machine, record.machine.trim()] as const]),
  ...(record.cabinetNumber === undefined || record.cabinetNumber.trim() === ""
    ? []
    : [[PLAY_TAGS.cabinetNumber, record.cabinetNumber.trim()] as const]),
]

/** The play's theoretical value, where it was given. */
const statisticPostings = (record: PlayHead): readonly Posting[] => (record.theoreticalValue === undefined ? [] : [theoreticalValuePosting(record.theoreticalValue)])

const postingsOf = (record: PlayRecord, rate: Decimal | undefined): readonly Posting[] => {
  const holding = holdingOf(record)
  return [
    ...(record.rental === undefined || rate === undefined ? [] : rentalPostings(record.rental, rate, holding)),
    ...shotPostings(rentedTokens(record), record.replay, holding),
    ...payoutPostings(record.payout, holding),
    ...statisticPostings(record),
  ]
}

/**
 * One play as one journal entry: rental, shooting, payout and theoretical
 * value together, so a play is one change to the book and one commit.
 */
export const composePlayEntry = (record: PlayRecord, prices: readonly PricePoint[]): Result<Entry, PlayError> =>
  andThen(validatePlay(record), (valid) =>
    mapOk(rentalRate(valid, prices), (rate) => ({
      date: valid.date,
      description: describe(valid, valid.parlor),
      tags: tagsOf(valid, valid.parlor),
      postings: postingsOf(valid, rate),
    })),
  )

/**
 * A result in yen, between cash and the play's revenue or expense: a gain is
 * revenue, a loss an expense, so the income statement counts it as it counts
 * any play. An even result moves no money and writes no real posting.
 */
const resultPostings = (result: Decimal): readonly Posting[] =>
  isNegative(result)
    ? [real(ACCOUNTS.playExpense, negate(result), YEN), real(ACCOUNTS.cash, result, YEN)]
    : unlessZero(result, [real(ACCOUNTS.cash, result, YEN), real(ACCOUNTS.playRevenue, negate(result), YEN)])

/** One play kept in yen as one journal entry: its result and its theoretical value together. */
export const composeTalliedEntry = (play: TalliedPlay): Result<Entry, PlayError> =>
  mapOk(validateTalliedPlay(play), (valid) => ({
    date: valid.date,
    description: describe(valid, valid.parlor),
    tags: tagsOf(valid, valid.parlor),
    postings: [...resultPostings(valid.result), ...statisticPostings(valid)],
  }))
