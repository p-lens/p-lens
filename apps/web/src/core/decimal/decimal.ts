import { Err, Ok, type Result } from "../result/result"

/**
 * An exact decimal: an integer mantissa and how many of its digits fall after
 * the point. The shape hledger keeps quantities in, so a figure that came from
 * hledger is never passed through a binary float on its way to the screen.
 */
export interface Decimal {
  readonly mantissa: bigint
  readonly places: number
}

export const decimal = (mantissa: bigint, places: number): Decimal => normalised({ mantissa, places })

export const ZERO: Decimal = { mantissa: 0n, places: 0 }

/** Drop trailing zeros after the point, so equal values have one shape. */
const normalised = (value: Decimal): Decimal =>
  value.places > 0 && value.mantissa % 10n === 0n
    ? normalised({ mantissa: value.mantissa / 10n, places: value.places - 1 })
    : value

const scaledTo = (value: Decimal, places: number): bigint => value.mantissa * 10n ** BigInt(places - value.places)

const aligned = (left: Decimal, right: Decimal): readonly [bigint, bigint, number] => {
  const places = Math.max(left.places, right.places)
  return [scaledTo(left, places), scaledTo(right, places), places]
}

export const add = (left: Decimal, right: Decimal): Decimal => {
  const [l, r, places] = aligned(left, right)
  return decimal(l + r, places)
}

export const negate = (value: Decimal): Decimal => ({ mantissa: -value.mantissa, places: value.places })

export const subtract = (left: Decimal, right: Decimal): Decimal => add(left, negate(right))

export const multiply = (left: Decimal, right: Decimal): Decimal =>
  decimal(left.mantissa * right.mantissa, left.places + right.places)

export const sum = (values: readonly Decimal[]): Decimal => values.reduce(add, ZERO)

export const compare = (left: Decimal, right: Decimal): -1 | 0 | 1 => {
  const [l, r] = aligned(left, right)
  return l < r ? -1 : l > r ? 1 : 0
}

export const isZero = (value: Decimal): boolean => value.mantissa === 0n

export const isNegative = (value: Decimal): boolean => value.mantissa < 0n

/** The value with a plain `.` and no grouping: how a journal writes a number. */
export const toPlainString = (value: Decimal): string => {
  const digits = (value.mantissa < 0n ? -value.mantissa : value.mantissa).toString().padStart(value.places + 1, "0")
  const whole = digits.slice(0, digits.length - value.places)
  const fraction = digits.slice(digits.length - value.places)
  return `${value.mantissa < 0n ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}`
}

export interface NotANumber {
  readonly type: "not-a-number"
  readonly text: string
}

const PLAIN_NUMBER = /^(-?)(\d+)(?:\.(\d+))?$/

/**
 * Read a number as a person typed it: digits, at most one point, an optional
 * leading minus, and commas grouping the digits.
 */
export const parseDecimal = (text: string): Result<Decimal, NotANumber> => {
  const match = PLAIN_NUMBER.exec(text.trim().replaceAll(",", ""))
  if (match === null) return Err({ type: "not-a-number", text })
  const [, sign = "", whole = "", fraction = ""] = match
  return Ok(decimal(BigInt(`${sign}${whole}${fraction}`), fraction.length))
}

/** Rounded to a number of places, halves away from zero. */
export const rounded = (value: Decimal, places: number): Decimal => {
  if (value.places <= places) return value
  const divisor = 10n ** BigInt(value.places - places)
  const magnitude = value.mantissa < 0n ? -value.mantissa : value.mantissa
  const roundedMagnitude = (magnitude + divisor / 2n) / divisor
  return decimal(value.mantissa < 0n ? -roundedMagnitude : roundedMagnitude, places)
}

/** A value rounded down to a number of places, towards minus infinity. */
const floored = (value: Decimal, places: number): Decimal => {
  if (value.places <= places) return value
  const divisor = 10n ** BigInt(value.places - places)
  const down = value.mantissa / divisor
  return decimal(value.mantissa < 0n && down * divisor !== value.mantissa ? down - 1n : down, places)
}

/**
 * Parts of a whole rounded to a number of places so that they still add up
 * to the whole rounded: each is rounded down, and what that leaves short
 * goes a unit at a time to the parts that lost most, the first among
 * equals — the largest remainder. Each part ends within a unit of itself.
 */
export const apportioned = (parts: readonly Decimal[], places: number): readonly Decimal[] => {
  const unit = decimal(1n, places)
  const downs = parts.map((part) => floored(part, places))
  const short = Number(quotient(subtract(rounded(sum(parts), places), sum(downs)), unit, 0).mantissa)
  const raised = new Set(
    parts
      .map((part, index) => ({ index, lost: subtract(part, downs[index] ?? ZERO) }))
      .toSorted((left, right) => compare(right.lost, left.lost) || left.index - right.index)
      .slice(0, short)
      .map((each) => each.index),
  )
  return downs.map((down, index) => (raised.has(index) ? add(down, unit) : down))
}

/**
 * One value divided by another, to a number of places, halves away from zero.
 * Division is the one operation that does not stay exact, so it says how far.
 */
export const quotient = (dividend: Decimal, divisor: Decimal, places: number): Decimal => {
  const [l, r] = aligned(dividend, divisor)
  const scaled = l * 10n ** BigInt(places + 1)
  const raw = scaled / r
  const magnitude = raw < 0n ? -raw : raw
  const roundedMagnitude = (magnitude + 5n) / 10n
  return decimal(raw < 0n ? -roundedMagnitude : roundedMagnitude, places)
}
