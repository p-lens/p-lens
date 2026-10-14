import { compare, isNegative, isZero, type Decimal } from "../decimal/decimal"
import { samePool } from "../parlor/parlor"
import { Err, Ok, andThen, type Result } from "../result/result"
import type { NumericField, TallyError, TallyHead, TokenTally, YenTally, TextField } from "./tally"
import { tokenKindOf } from "../play/play"

type Check<R = TokenTally> = (tally: R) => Result<R, TallyError>

/**
 * Characters a tag value or a description cannot hold: a comma ends a tag
 * value, a semicolon starts a comment, a line break ends the entry.
 */
const UNWRITABLE = /[,;\n\r]/

export const isWritableText = (text: string): boolean => !UNWRITABLE.test(text)

const checkMachine = <R extends TallyHead>(tally: R): Result<R, TallyError> =>
  tally.machine.trim() === "" ? Err({ type: "machine-missing" }) : Ok(tally)

const checkWritable =
  <R extends TallyHead>(field: TextField, read: (tally: R) => string | undefined): Check<R> =>
  (tally) => {
    const text = read(tally)
    return text !== undefined && !isWritableText(text) ? Err({ type: "text-unwritable", field, text }) : Ok(tally)
  }

const checkNonNegative =
  <R = TokenTally>(field: NumericField, read: (tally: R) => Decimal | undefined): Check<R> =>
  (tally) => {
    const value = read(tally)
    return value !== undefined && isNegative(value) ? Err({ type: "negative-amount", field }) : Ok(tally)
  }

/** Tokens are counted, never measured: a third of a ball does not exist. */
const checkWholeTokens =
  (field: NumericField, read: (tally: TokenTally) => Decimal | undefined): Check =>
  (tally) => {
    const value = read(tally)
    return value !== undefined && value.places > 0 ? Err({ type: "fractional-tokens", field }) : Ok(tally)
  }

/** A rental is cash for tokens: one without the other is a half-written rental. */
const checkRentalComplete: Check = (tally) =>
  tally.rental !== undefined && isZero(tally.rental.outlay) !== isZero(tally.rental.tokens)
    ? Err({ type: "rental-incomplete" })
    : Ok(tally)

const checkSomethingPlayed: Check = (tally) =>
  (tally.rental === undefined || isZero(tally.rental.tokens)) && isZero(tally.replay.paidOut) && isZero(tally.carriedIn) && isZero(tally.payout)
    ? Err({ type: "nothing-played" })
    : Ok(tally)

const checkReplayFee: Check = (tally) => (compare(tally.replay.deducted, tally.replay.paidOut) < 0 ? Err({ type: "replay-below-payout" }) : Ok(tally))

/** The pool is the game's kind of token, and one the parlor keeps savings of. */
const checkPoolKept: Check = (tally) =>
  tally.pool.kind === tokenKindOf(tally.gameKind) && tally.parlor.pools.some((pool) => samePool(pool, tally.pool))
    ? Ok(tally)
    : Err({ type: "pool-not-kept", parlor: tally.parlor, pool: tally.pool })

/** Savings the book does not keep are a play's at no parlor alone, and the cash of its outlay never more than the outlay. */
const checkSettlement: Check<YenTally> = (tally) => {
  const settlement = tally.settlement
  if (settlement?.type !== "off-book-savings") return Ok(tally)
  if (tally.parlor !== undefined) return Err({ type: "off-book-at-parlor" })
  if (isNegative(settlement.cash)) return Err({ type: "negative-amount", field: "outlay" })
  return compare(settlement.cash, tally.outlay) > 0 ? Err({ type: "cash-beyond-outlay" }) : Ok(tally)
}

/** What every tally must say well enough to be written, however its result is kept. */
const headChecks = <R extends TallyHead>(): readonly Check<R>[] => [
  checkMachine,
  checkWritable<R>("machine", (tally) => tally.machine),
  checkWritable<R>("cabinet-number", (tally) => tally.cabinetNumber),
]

const CHECKS: readonly Check[] = [
  ...headChecks<TokenTally>(),
  checkNonNegative("outlay", (tally) => tally.rental?.outlay),
  checkNonNegative("rental-tokens", (tally) => tally.rental?.tokens),
  checkNonNegative("replay-paid-out", (tally) => tally.replay.paidOut),
  checkNonNegative("replay-deducted", (tally) => tally.replay.deducted),
  checkNonNegative("carried-in", (tally) => tally.carriedIn),
  checkNonNegative("payout", (tally) => tally.payout),
  checkWholeTokens("rental-tokens", (tally) => tally.rental?.tokens),
  checkWholeTokens("replay-paid-out", (tally) => tally.replay.paidOut),
  checkWholeTokens("replay-deducted", (tally) => tally.replay.deducted),
  checkWholeTokens("carried-in", (tally) => tally.carriedIn),
  checkWholeTokens("payout", (tally) => tally.payout),
  checkRentalComplete,
  checkSomethingPlayed,
  checkReplayFee,
  checkPoolKept,
]

const passes = <R>(checks: readonly Check<R>[], tally: R): Result<R, TallyError> =>
  checks.reduce<Result<R, TallyError>>((checked, check) => andThen(checked, check), Ok(tally))

/** A tally in tokens that can be written as an entry, or the first reason it cannot. */
export const validateTokenTally = (tally: TokenTally): Result<TokenTally, TallyError> => passes(CHECKS, tally)

/**
 * A tally in yen has its words to check, and that neither side of it is
 * below nothing: any result, gain or loss, can be written. It may name no
 * machine — a day's result remembered with nothing else — where a tally in
 * tokens at a parlor's rates always names its own.
 */
export const validateYenTally = (tally: YenTally): Result<YenTally, TallyError> =>
  passes<YenTally>(
    [
      checkWritable<YenTally>("machine", (tally) => tally.machine),
      checkWritable<YenTally>("cabinet-number", (tally) => tally.cabinetNumber),
      checkNonNegative<YenTally>("outlay", (tally) => tally.outlay),
      checkNonNegative<YenTally>("takings", (tally) => tally.takings),
      checkSettlement,
    ],
    tally,
  )
