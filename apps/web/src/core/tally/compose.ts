import { YEN, tokenCommodity, type TokenKind } from "../commodity/commodity"
import { isZero, multiply, negate, subtract, toPlainString, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, rentalSpreadAccount, savingsAccount } from "../journal/accounts"
import { describedBy, type Entry, type Posting } from "../journal/entry"
import { Err, Ok, andThen, mapOk, type Result } from "../result/result"
import { inferredTheoreticalValuePosting, theoreticalValuePosting } from "../theoretical/theoretical"
import { rateOn, rateReachingBack, type PricePoint } from "../valuation/valuation"
import { identityTags, type Parlor } from "../parlor/parlor"
import { TALLY_TAGS, type TallyError, type TallyHead, type TokenTally, type TallyTold, type Rental, type Replay, type YenTally } from "./tally"
import { asideTags } from "./aside"
import { sidePostings } from "./sides"
import { validateTokenTally, validateYenTally } from "./validate"

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

const holdingOf = (tally: TokenTally): Holding => ({
  account: savingsAccount(tally.pool.kind, tally.parlor.name, tally.pool.tier),
  commodity: tokenCommodity(tally.pool.kind, tally.parlor.name, tally.pool.tier),
  kind: tally.pool.kind,
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

/** Tokens left at the finish, earned by the play and put into savings. */
const payoutPostings = (payout: Decimal, holding: Holding): readonly Posting[] =>
  unlessZero(payout, [real(holding.account, payout, holding.commodity), real(ACCOUNTS.playRevenue, negate(payout), holding.commodity)])

/**
 * The exchange rate a rental is split at, if the tally rents anything.
 * `undefined` inside `Ok` means there is no rental to split.
 */
const rentalRate = (tally: TokenTally, prices: readonly PricePoint[]): Result<Decimal | undefined, TallyError> => {
  if (tally.rental === undefined || isZero(tally.rental.tokens)) return Ok(undefined)
  const commodity = tokenCommodity(tally.pool.kind, tally.parlor.name, tally.pool.tier)
  const point = rateOn(prices, commodity, tally.date)
  return point === undefined ? Err({ type: "no-exchange-rate", commodity, date: tally.date }) : Ok(point.rate)
}

/**
 * The rate to be written with a tally on a day its pool has no rate for:
 * the pool's first, reaching back to the tally's day, so that a tally dated
 * before its pool was opened is recorded all the same. Nothing where the day has a
 * rate.
 */
export const rateToWriteWith = (tally: TokenTally, prices: readonly PricePoint[]): PricePoint | undefined =>
  rateReachingBack(prices, tokenCommodity(tally.pool.kind, tally.parlor.name, tally.pool.tier), tally.date)

const cabinetOf = (tally: TallyHead): string => [tally.machine.trim(), tally.cabinetNumber === undefined ? "" : `${tally.cabinetNumber.trim()}番台`].filter((part) => part !== "").join(" ")

/** A tally's description: the parlor as the payee, the machine and its cabinet as the note. */
const describe = (tally: TallyHead, parlor: Parlor | undefined): string => describedBy(parlor?.name, cabinetOf(tally))

/** What an entry says of the tokens carried in, where there were any: its postings alone read as a replay's, so the count is said beside them. */
const carriedTags = (tally: TokenTally): Entry["tags"] => (isZero(tally.carriedIn) ? [] : [[TALLY_TAGS.carriedIn, toPlainString(tally.carriedIn)]])

const tagsOf = (tally: TallyHead, parlor: Parlor | undefined): Entry["tags"] => [
  [TALLY_TAGS.playId, tally.id],
  ...(parlor === undefined ? [] : identityTags(parlor.identity)),
  [TALLY_TAGS.gameKind, tally.gameKind],
  ...(tally.machine.trim() === "" ? [] : [[TALLY_TAGS.machine, tally.machine.trim()] as const]),
  ...(tally.cabinetNumber === undefined || tally.cabinetNumber.trim() === ""
    ? []
    : [[TALLY_TAGS.cabinetNumber, tally.cabinetNumber.trim()] as const]),
  ...asideTags(tally),
]

/** The tally's theoretical value, where it was given. */
const statisticPostings = (tally: TallyHead): readonly Posting[] => (tally.theoreticalValue === undefined ? [] : [theoreticalValuePosting(tally.theoreticalValue)])

const postingsOf = (tally: TokenTally, rate: Decimal | undefined): readonly Posting[] => {
  const holding = holdingOf(tally)
  return [
    ...(tally.rental === undefined || rate === undefined ? [] : rentalPostings(tally.rental, rate, holding)),
    ...replayPostings(tally.replay, holding),
    ...carriedPostings(tally.carriedIn, holding),
    ...payoutPostings(tally.payout, holding),
    ...statisticPostings(tally),
  ]
}

/**
 * A tally in tokens as one journal entry: rental, replay, tokens carried
 * in, payout and theoretical value together, so a tally is one change to
 * the book and one commit.
 */
export const composeTokenTallyEntry = (tally: TokenTally, prices: readonly PricePoint[]): Result<Entry, TallyError> =>
  andThen(validateTokenTally(tally), (valid) =>
    mapOk(rentalRate(valid, prices), (rate) => ({
      date: valid.date,
      description: describe(valid, valid.parlor),
      tags: [...tagsOf(valid, valid.parlor), ...carriedTags(valid)],
      postings: postingsOf(valid, rate),
    })),
  )

/** What an entry says of what was told of its tally's play: its hours, and each of the rest where it was told or taken. */
export const toldTags = (told: TallyTold | undefined): Entry["tags"] =>
  told === undefined
    ? []
    : [
        [TALLY_TAGS.hours, toPlainString(told.hours)],
        ...(told.jackpots === undefined ? [] : [[TALLY_TAGS.jackpots, String(told.jackpots)] as const]),
        ...(told.inferred === undefined
          ? []
          : [
              [TALLY_TAGS.inferredFormula, told.inferred.formulaId] as const,
              [TALLY_TAGS.tokenRental, toPlainString(told.inferred.tokenRental)] as const,
              [TALLY_TAGS.tokenExchange, toPlainString(told.inferred.tokenExchange)] as const,
              ...(told.inferred.spinPerformance === undefined ? [] : [[TALLY_TAGS.inferredSpinPerformance, toPlainString(told.inferred.spinPerformance)] as const]),
            ]),
      ]

/** What a told tally's play was taken to be worth, where it was weighed and no theoretical value was given: one given is the tally's, and nothing is inferred beside it. */
const inferredPostings = (tally: YenTally): readonly Posting[] => (tally.theoreticalValue !== undefined || tally.told?.inferred === undefined ? [] : [inferredTheoreticalValuePosting(tally.told.inferred.value)])

/** A tally in yen as one journal entry: its two sides and its theoretical value — given, or inferred from what was told of it — together. */
export const composeYenTallyEntry = (tally: YenTally): Result<Entry, TallyError> =>
  mapOk(validateYenTally(tally), (valid) => ({
    date: valid.date,
    description: describe(valid, valid.parlor),
    tags: [...tagsOf(valid, valid.parlor), ...toldTags(valid.told)],
    postings: [...sidePostings(valid.outlay, valid.takings), ...statisticPostings(valid), ...inferredPostings(valid)],
  }))
