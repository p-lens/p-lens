import { YEN, tokenCommodity, type TokenKind } from "../commodity/commodity"
import { isZero, multiply, negate, subtract, toPlainString, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, rentalSpreadAccount, savingsAccount } from "../journal/accounts"
import { describedBy, type Entry, type Posting } from "../journal/entry"
import { Err, Ok, andThen, mapOk, type Result } from "../result/result"
import { inferredTheoreticalValuePosting, theoreticalValuePosting } from "../theoretical/theoretical"
import { rateOn, rateReachingBack, type PricePoint } from "../valuation/valuation"
import { identityTags, type Parlor } from "../parlor/parlor"
import { PLAY_TAGS, type PlayError, type PlayHead, type PlayRecord, type PlayTold, type Rental, type Replay, type TalliedPlay } from "./play"
import { sidePostings } from "./sides"
import { validatePlay, validateTalliedPlay } from "./validate"

const real = (account: string, quantity: Decimal, commodity: string): Posting => ({
  account,
  amount: { quantity, commodity },
  kind: "real",
})

/** Leave out a pair of postings that would move nothing. */
const unlessZero = (quantity: Decimal, postings: readonly Posting[]): readonly Posting[] =>
  isZero(quantity) ? [] : postings

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

/**
 * Renting tokens and shooting them: cash spent on the play, split at the
 * moment of renting into what the tokens are worth at that day's exchange
 * rate and the spread lost on top of it. Rented tokens are never savings —
 * they go from the counter into the cabinet — so no savings account is
 * touched.
 *
 * ¥12,000 for 3,000 balls exchanged at ¥3.57 is ¥10,710 of balls shot and a
 * ¥1,290 loss, settled that day. A later change of rate moves what balls
 * are worth and never this loss.
 */
const rentalPostings = (rental: Rental, rate: Decimal, holding: Holding): readonly Posting[] => {
  const spread = subtract(rental.outlay, multiply(rental.tokens, rate))
  return unlessZero(rental.tokens, [
    real(ACCOUNTS.cash, negate(rental.outlay), YEN),
    ...unlessZero(spread, [real(rentalSpreadAccount(holding.kind), spread, YEN)]),
    { ...real(ACCOUNTS.playExpense, rental.tokens, holding.commodity), cost: { rate, commodity: YEN } },
  ])
}

/**
 * A replay: tokens out of savings and spent, with the replay's fee taken
 * off savings beside them. Counted in tokens only; what that comes to in
 * yen is hledger's to say, at the rate of the day it is asked about.
 */
const replayPostings = (replay: Replay, holding: Holding): readonly Posting[] => {
  const fee = subtract(replay.deducted, replay.paidOut)
  return [
    ...unlessZero(replay.deducted, [real(holding.account, negate(replay.deducted), holding.commodity)]),
    ...unlessZero(replay.paidOut, [real(ACCOUNTS.playExpense, replay.paidOut, holding.commodity)]),
    ...unlessZero(fee, [real(ACCOUNTS.replayFee, fee, holding.commodity)]),
  ]
}

/**
 * Tokens in hand as the play began, brought from the play before: out of
 * savings, where that play put them, and spent, with no fee — they never
 * went to the counter.
 */
const carriedPostings = (carriedIn: Decimal, holding: Holding): readonly Posting[] =>
  unlessZero(carriedIn, [real(holding.account, negate(carriedIn), holding.commodity), real(ACCOUNTS.playExpense, carriedIn, holding.commodity)])

/** Tokens left at the end, earned by the play and put into savings. */
const payoutPostings = (payout: Decimal, holding: Holding): readonly Posting[] =>
  unlessZero(payout, [real(holding.account, payout, holding.commodity), real(ACCOUNTS.playRevenue, negate(payout), holding.commodity)])

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

/**
 * The rate to be written with a play on a day its pool has no rate for: the
 * pool's first, reaching back to the play's day, so that a play dated before
 * its pool was opened is recorded all the same. Nothing where the day has a
 * rate.
 */
export const rateToWriteWith = (record: PlayRecord, prices: readonly PricePoint[]): PricePoint | undefined =>
  rateReachingBack(prices, tokenCommodity(record.pool.kind, record.parlor.name, record.pool.tier), record.date)

const cabinetOf = (record: PlayHead): string => [record.machine.trim(), record.cabinetNumber === undefined ? "" : `${record.cabinetNumber.trim()}番台`].filter((part) => part !== "").join(" ")

/** A play's description: the parlor as the payee, the machine and its cabinet as the note. */
const describe = (record: PlayHead, parlor: Parlor | undefined): string => describedBy(parlor?.name, cabinetOf(record))

/** What an entry says of the tokens carried in, where there were any: its postings alone read as a replay's, so the count is said beside them. */
const carriedTags = (record: PlayRecord): Entry["tags"] => (isZero(record.carriedIn) ? [] : [[PLAY_TAGS.carriedIn, toPlainString(record.carriedIn)]])

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
    ...replayPostings(record.replay, holding),
    ...carriedPostings(record.carriedIn, holding),
    ...payoutPostings(record.payout, holding),
    ...statisticPostings(record),
  ]
}

/**
 * One play as one journal entry: rental, replay, tokens carried in, payout and theoretical
 * value together, so a play is one change to the book and one commit.
 */
export const composePlayEntry = (record: PlayRecord, prices: readonly PricePoint[]): Result<Entry, PlayError> =>
  andThen(validatePlay(record), (valid) =>
    mapOk(rentalRate(valid, prices), (rate) => ({
      date: valid.date,
      description: describe(valid, valid.parlor),
      tags: [...tagsOf(valid, valid.parlor), ...carriedTags(valid)],
      postings: postingsOf(valid, rate),
    })),
  )

/** What an entry says of what was told of its play: its hours, and each of the rest where it was told or taken. */
export const toldTags = (told: PlayTold | undefined): Entry["tags"] =>
  told === undefined
    ? []
    : [
        [PLAY_TAGS.hours, toPlainString(told.hours)],
        ...(told.jackpots === undefined ? [] : [[PLAY_TAGS.jackpots, String(told.jackpots)] as const]),
        ...(told.inferred === undefined
          ? []
          : [
              [PLAY_TAGS.inferredFormula, told.inferred.formulaId] as const,
              [PLAY_TAGS.tokenRental, toPlainString(told.inferred.tokenRental)] as const,
              [PLAY_TAGS.tokenExchange, toPlainString(told.inferred.tokenExchange)] as const,
            ]),
      ]

/** What a told play was taken to be worth, where it was weighed and no theoretical value was given: one given is the play's, and nothing is inferred beside it. */
const inferredPostings = (play: TalliedPlay): readonly Posting[] => (play.theoreticalValue !== undefined || play.told?.inferred === undefined ? [] : [inferredTheoreticalValuePosting(play.told.inferred.value)])

/** One play kept in yen as one journal entry: its two sides and its theoretical value — given, or inferred from what was told of it — together. */
export const composeTalliedEntry = (play: TalliedPlay): Result<Entry, PlayError> =>
  mapOk(validateTalliedPlay(play), (valid) => ({
    date: valid.date,
    description: describe(valid, valid.parlor),
    tags: [...tagsOf(valid, valid.parlor), ...toldTags(valid.told)],
    postings: [...sidePostings(valid.outlay, valid.takings), ...statisticPostings(valid), ...inferredPostings(valid)],
  }))
