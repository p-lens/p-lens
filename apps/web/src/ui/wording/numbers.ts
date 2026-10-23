import type { TokenKind } from "../../core/commodity/commodity"
import { isNegative, isZero, negate, rounded, toPlainString, type Decimal } from "../../core/decimal/decimal"

const groupDigits = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

/** A plain decimal with its whole part grouped by thousands. */
const grouped = (value: Decimal): string => {
  const [whole = "0", fraction] = toPlainString(value).replace("-", "").split(".")
  return `${isNegative(value) ? "-" : ""}${groupDigits(whole)}${fraction === undefined ? "" : `.${fraction}`}`
}

/** Yen as a person reads it: whole yen, grouped, the sign before the mark. */
export const formatYen = (value: Decimal): string => {
  const whole = rounded(value, 0)
  return isNegative(whole) ? `-¥${grouped(negate(whole))}` : `¥${grouped(whole)}`
}

/** Yen for a result, always signed, so a gain and a loss never look alike. */
export const formatSignedYen = (value: Decimal): string => {
  const whole = rounded(value, 0)
  return isZero(whole) ? "¥0" : isNegative(whole) ? `-¥${grouped(negate(whole))}` : `+¥${grouped(whole)}`
}

/** Which way a result went, for choosing its colour. */
export const toneOf = (value: Decimal): "positive" | "negative" | "neutral" => {
  const whole = rounded(value, 0)
  return isZero(whole) ? "neutral" : isNegative(whole) ? "negative" : "positive"
}

/** What tallies made, where nothing is known of it yet: dashes in the shape the figure would have. */
export const UNSEEN_ACTUAL = "¥-,---"

/** What tallies were worth, where nothing is known of it yet: a figure that goes either way, and for most tallies stays in the hundreds. */
export const UNSEEN_THEORETICAL = "±¥---"

const TOKEN_UNITS: Readonly<Record<TokenKind, string>> = { ball: "玉", medal: "枚" }

export const tokenUnit = (kind: TokenKind): string => TOKEN_UNITS[kind]

/** Tokens as whole ones, rounded half up: a count hledger hands back with places of its own never shows them. */
export const formatTokens = (value: Decimal, kind: TokenKind): string => `${grouped(rounded(value, 0))}${TOKEN_UNITS[kind]}`

/** An exchange rate, always with at least two decimal places: `3.50`. */
/**
 * An exchange rate as parlors write one: two places, rounded half up — 1000
 * yen for 280 balls is 3.57, 100 for 26 is 3.85 — though the book keeps the
 * ratio itself, since that is what is actually paid.
 */
export const formatRate = (value: Decimal): string => {
  const [whole = "0", fraction = ""] = toPlainString(rounded(value, 2)).split(".")
  return `${whole}.${fraction.padEnd(2, "0")}`
}

export const formatCount = (value: number): string => groupDigits(String(value))

const MAN = 10_000

const OKU = 100_000_000

/** A large count the way it is said: `4,120,000` as `412万`, `1,250,000,000` as `12億5,000万`, below ten thousand as it is. */
export const formatMan = (value: number): string => {
  if (value < MAN) return formatCount(value)
  if (value < OKU) return `${formatCount(Math.floor(value / MAN))}万`
  const man = Math.floor((value % OKU) / MAN)
  return `${formatCount(Math.floor(value / OKU))}億${man === 0 ? "" : `${formatCount(man)}万`}`
}

/** An amount in any commodity as a posting carries it: yen as yen, tokens with their commodity. */
export const formatCommodityAmount = (value: Decimal, commodity: string): string =>
  commodity === "JPY" ? formatYen(value) : `${grouped(value)} ${commodity}`

/** A yen figure worked out in floating point, signed and whole: `+¥12,340`, `-¥560`; dashes for none. */
export const yenFigureText = (value: number | null | undefined): string =>
  value === null || value === undefined ? "--" : `${value < 0 ? "-" : "+"}¥${formatCount(Math.round(Math.abs(value)))}`

/**
 * What tallies were worth in yen, as a figure with no colour to say which
 * way it went: always marked, a gain `+`, a loss `-`, and nothing at all
 * `±¥0`.
 */
export const formatTheoreticalYen = (value: Decimal): string => (isZero(rounded(value, 0)) ? "±¥0" : formatSignedYen(value))

/** A theoretical value worked out in floating point, marked the same way: `+¥1,240`, `-¥380`, `±¥0`; its empty shape for none. */
export const theoreticalFigureText = (value: number | null | undefined): string =>
  value === null || value === undefined ? UNSEEN_THEORETICAL : Math.round(value) === 0 ? "±¥0" : yenFigureText(value)

/**
 * A theoretical value too small for whole yen, to a fixed count of places,
 * marked the same way: `+¥1.2345`, `-¥0.0310`, `±¥0.0000`; its empty shape
 * for none.
 */
export const theoreticalFractionText = (value: number | null | undefined, places: number): string => {
  if (value === null || value === undefined) return UNSEEN_THEORETICAL
  const [whole = "0", fraction = ""] = Math.abs(value).toFixed(places).split(".")
  const sign = Number(`${whole}.${fraction}`) === 0 ? "±" : value < 0 ? "-" : "+"
  return `${sign}¥${groupDigits(whole)}.${fraction}`
}
