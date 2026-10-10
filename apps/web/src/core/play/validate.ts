import { compare, isNegative, isZero, type Decimal } from "../decimal/decimal"
import { samePool } from "../parlor/parlor"
import { Err, Ok, andThen, type Result } from "../result/result"
import { tokenKindOf, type NumericField, type PlayError, type PlayHead, type PlayRecord, type TalliedPlay, type TextField } from "./play"

type Check<R = PlayRecord> = (record: R) => Result<R, PlayError>

/**
 * Characters a tag value or a description cannot hold: a comma ends a tag
 * value, a semicolon starts a comment, a line break ends the entry.
 */
const UNWRITABLE = /[,;\n\r]/

export const isWritableText = (text: string): boolean => !UNWRITABLE.test(text)

const checkMachine = <R extends PlayHead>(record: R): Result<R, PlayError> =>
  record.machine.trim() === "" ? Err({ type: "machine-missing" }) : Ok(record)

const checkWritable =
  <R extends PlayHead>(field: TextField, read: (record: R) => string | undefined): Check<R> =>
  (record) => {
    const text = read(record)
    return text !== undefined && !isWritableText(text) ? Err({ type: "text-unwritable", field, text }) : Ok(record)
  }

const checkNonNegative =
  (field: NumericField, read: (record: PlayRecord) => Decimal | undefined): Check =>
  (record) => {
    const value = read(record)
    return value !== undefined && isNegative(value) ? Err({ type: "negative-amount", field }) : Ok(record)
  }

/** Tokens are counted, never measured: a third of a ball does not exist. */
const checkWholeTokens =
  (field: NumericField, read: (record: PlayRecord) => Decimal | undefined): Check =>
  (record) => {
    const value = read(record)
    return value !== undefined && value.places > 0 ? Err({ type: "fractional-tokens", field }) : Ok(record)
  }

/** A rental is cash for tokens: one without the other is a half-written rental. */
const checkRentalComplete: Check = (record) =>
  record.rental !== undefined && isZero(record.rental.outlay) !== isZero(record.rental.tokens)
    ? Err({ type: "rental-incomplete" })
    : Ok(record)

const checkSomethingPlayed: Check = (record) =>
  (record.rental === undefined || isZero(record.rental.tokens)) && isZero(record.replay.paidOut) && isZero(record.payout)
    ? Err({ type: "nothing-played" })
    : Ok(record)

const checkReplayFee: Check = (record) => (compare(record.replay.deducted, record.replay.paidOut) < 0 ? Err({ type: "replay-below-payout" }) : Ok(record))

/** The pool is the game's kind of token, and one the parlor keeps savings of. */
const checkPoolKept: Check = (record) =>
  record.pool.kind === tokenKindOf(record.gameKind) && record.parlor.pools.some((pool) => samePool(pool, record.pool))
    ? Ok(record)
    : Err({ type: "pool-not-kept", parlor: record.parlor, pool: record.pool })

/** What every play must say well enough to be written, however its result is kept. */
const headChecks = <R extends PlayHead>(): readonly Check<R>[] => [
  checkMachine,
  checkWritable<R>("machine", (record) => record.machine),
  checkWritable<R>("cabinet-number", (record) => record.cabinetNumber),
]

const CHECKS: readonly Check[] = [
  ...headChecks<PlayRecord>(),
  checkNonNegative("outlay", (record) => record.rental?.outlay),
  checkNonNegative("rental-tokens", (record) => record.rental?.tokens),
  checkNonNegative("replay-paid-out", (record) => record.replay.paidOut),
  checkNonNegative("replay-deducted", (record) => record.replay.deducted),
  checkNonNegative("payout", (record) => record.payout),
  checkWholeTokens("rental-tokens", (record) => record.rental?.tokens),
  checkWholeTokens("replay-paid-out", (record) => record.replay.paidOut),
  checkWholeTokens("replay-deducted", (record) => record.replay.deducted),
  checkWholeTokens("payout", (record) => record.payout),
  checkRentalComplete,
  checkSomethingPlayed,
  checkReplayFee,
  checkPoolKept,
]

const passes = <R>(checks: readonly Check<R>[], record: R): Result<R, PlayError> =>
  checks.reduce<Result<R, PlayError>>((checked, check) => andThen(checked, check), Ok(record))

/** A record that can be written as an entry, or the first reason it cannot. */
export const validatePlay = (record: PlayRecord): Result<PlayRecord, PlayError> => passes(CHECKS, record)

/**
 * A play kept in yen has only its words to check: any result, gain or loss,
 * can be written. It may name no machine — a day's result remembered with
 * nothing else — where a play at a parlor's rates always names its own.
 */
export const validateTalliedPlay = (play: TalliedPlay): Result<TalliedPlay, PlayError> =>
  passes<TalliedPlay>([checkWritable<TalliedPlay>("machine", (record) => record.machine), checkWritable<TalliedPlay>("cabinet-number", (record) => record.cabinetNumber)], play)
