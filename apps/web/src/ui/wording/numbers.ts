import type { TokenKind } from "../../core/commodity/commodity"
import { isNegative, isZero, negate, rounded, toPlainString, type Decimal } from "../../core/decimal/decimal"
import { veil, type KindWith, type Secret } from "../../mummer"
import { commodityText } from "./commodities"

const groupDigits = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

/** A plain decimal with its whole part grouped by thousands. */
const grouped = (value: Decimal): string => {
  const [whole = "0", fraction] = toPlainString(value).replace("-", "").split(".")
  return `${isNegative(value) ? "-" : ""}${groupDigits(whole)}${fraction === undefined ? "" : `.${fraction}`}`
}

/**
 * An amount sealed as what it is — a book's, a play's, savings' or a
 * formula's: money and tokens come to the words only so, and leave them
 * only through `veil`, so that 配信モード veils every one it should and
 * none it should not.
 */
export type Amount<T> = Secret<KindWith<"figure">, T>

/** What stands for the digits of an amount veiled: four places, whatever it is, so that its length tells nothing. */
const VEILED_DIGITS = "•,•••"

/** An amount as its figure where that is shown, and veiled where not: the way it went kept before the veiled digits where that is shown. */
const figured = <T>(amount: Amount<T>, shown: (value: T) => string, way: (value: T) => string, veiled: string): string =>
  veil.figure(amount, shown, `${veil.tone(amount, way, "")}${veiled}`)

const wholeYenOf = (value: Decimal): string => {
  const whole = rounded(value, 0)
  return isNegative(whole) ? `-¥${grouped(negate(whole))}` : `¥${grouped(whole)}`
}

const signedYenOf = (value: Decimal): string => {
  const whole = rounded(value, 0)
  return isZero(whole) ? "¥0" : isNegative(whole) ? `-¥${grouped(negate(whole))}` : `+¥${grouped(whole)}`
}

const minusOf = (value: Decimal): string => (isNegative(rounded(value, 0)) ? "-" : "")

const signOf = (value: Decimal): string => ((whole) => (isZero(whole) ? "" : isNegative(whole) ? "-" : "+"))(rounded(value, 0))

const theoreticalSignOf = (value: Decimal): string => signOf(value) || "±"

/** Yen as a person reads it: whole yen, grouped, the sign before the mark. */
export const formatYen = (amount: Amount<Decimal>): string => figured(amount, wholeYenOf, minusOf, `¥${VEILED_DIGITS}`)

/** Yen for a result, always signed, so a gain and a loss never look alike. */
export const formatSignedYen = (amount: Amount<Decimal>): string => figured(amount, signedYenOf, signOf, `¥${VEILED_DIGITS}`)

type Tone = "positive" | "negative" | "neutral"

const toneOfValue = (value: Decimal): Tone => {
  const whole = rounded(value, 0)
  return isZero(whole) ? "neutral" : isNegative(whole) ? "negative" : "positive"
}

/** Which way a result went, for choosing its colour: neutral wherever the way it went is veiled. */
export const toneOf = (amount: Amount<Decimal>): Tone => veil.tone(amount, toneOfValue, "neutral")

/** Which way a figure worked out in floating point went, for choosing its colour: neutral where it is none, or where the way it went is veiled. */
export const figureToneOf = (amount: Amount<number | null | undefined>): Tone =>
  veil.tone(amount, (value) => (value === null || value === undefined || Math.round(value) === 0 ? "neutral" : value < 0 ? "negative" : "positive"), "neutral")

/** What tallies made, where nothing is known of it yet: dashes in the shape the figure would have. */
export const UNSEEN_ACTUAL = "¥-,---"

/** What tallies were worth, where nothing is known of it yet: a figure that goes either way, and for most tallies stays in the hundreds. */
export const UNSEEN_THEORETICAL = "±¥---"

const TOKEN_UNITS: Readonly<Record<TokenKind, string>> = { ball: "玉", medal: "枚" }

export const tokenUnit = (kind: TokenKind): string => TOKEN_UNITS[kind]

/** Tokens as whole ones, rounded half up: a count hledger hands back with places of its own never shows them. */
export const formatTokens = (amount: Amount<Decimal>, kind: TokenKind): string => figured(amount, (value) => `${grouped(rounded(value, 0))}${TOKEN_UNITS[kind]}`, minusOf, `${VEILED_DIGITS}${TOKEN_UNITS[kind]}`)

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

/** A count of what happened — spins, jackpots, trials — grouped by thousands: never money or tokens, which are an `Amount`. */
export const formatCount = (value: number): string => groupDigits(String(value))

/** Money or tokens counted in whole numbers, grouped, with no mark or unit: the place the mark or unit goes is the caller's. */
export const amountText = (amount: Amount<number>): string => figured(amount, formatCount, (value) => (value < 0 ? "-" : ""), VEILED_DIGITS)

/** Money or tokens gained or lost, rounded to whole ones and always signed, with no mark or unit: `+1,400`, `-35`. */
export const signedAmountText = (amount: Amount<number>): string =>
  figured(amount, (value) => `${value < 0 ? "-" : "+"}${formatCount(Math.round(Math.abs(value)))}`, (value) => (value < 0 ? "-" : "+"), VEILED_DIGITS)

const MAN = 10_000

const OKU = 100_000_000

/** A large count the way it is said, never money or tokens: `4,120,000` as `412万`, `1,250,000,000` as `12億5,000万`, below ten thousand as it is. */
export const formatMan = (value: number): string => {
  if (value < MAN) return formatCount(value)
  if (value < OKU) return `${formatCount(Math.floor(value / MAN))}万`
  const man = Math.floor((value % OKU) / MAN)
  return `${formatCount(Math.floor(value / OKU))}億${man === 0 ? "" : `${formatCount(man)}万`}`
}

/** An amount in any commodity as a posting carries it: yen as yen, tokens with their commodity. */
export const formatCommodityAmount = (amount: Amount<Decimal>, commodity: string): string =>
  commodity === "JPY" ? formatYen(amount) : ((shown) => figured(amount, (value) => `${grouped(value)} ${shown}`, minusOf, `${VEILED_DIGITS} ${shown}`))(commodityText(commodity))

const yenFigureOf = (value: number | null | undefined): string => (value === null || value === undefined ? "--" : `${value < 0 ? "-" : "+"}¥${formatCount(Math.round(Math.abs(value)))}`)

const figureSignOf = (value: number | null | undefined): string => (value === null || value === undefined ? "" : value < 0 ? "-" : "+")

/** A yen figure worked out in floating point, signed and whole: `+¥12,340`, `-¥560`; dashes for none. */
export const yenFigureText = (amount: Amount<number | null | undefined>): string => figured(amount, yenFigureOf, figureSignOf, `¥${VEILED_DIGITS}`)

/**
 * What tallies were worth in yen, as a figure with no colour to say which
 * way it went: always marked, a gain `+`, a loss `-`, and nothing at all
 * `±¥0`.
 */
export const formatTheoreticalYen = (amount: Amount<Decimal>): string => figured(amount, (value) => (isZero(rounded(value, 0)) ? "±¥0" : signedYenOf(value)), theoreticalSignOf, `¥${VEILED_DIGITS}`)

const theoreticalFigureOf = (value: number | null | undefined): string => (value === null || value === undefined ? UNSEEN_THEORETICAL : Math.round(value) === 0 ? "±¥0" : yenFigureOf(value))

const theoreticalFigureSignOf = (value: number | null | undefined): string => (value === null || value === undefined ? "±" : Math.round(value) === 0 ? "±" : value < 0 ? "-" : "+")

/** A theoretical value worked out in floating point, marked the same way: `+¥1,240`, `-¥380`, `±¥0`; its empty shape for none. */
export const theoreticalFigureText = (amount: Amount<number | null | undefined>): string => figured(amount, theoreticalFigureOf, theoreticalFigureSignOf, `¥${VEILED_DIGITS}`)

const fractionSignOf = (value: number | null | undefined, places: number): string =>
  value === null || value === undefined || Number(Math.abs(value).toFixed(places)) === 0 ? "±" : value < 0 ? "-" : "+"

const theoreticalFractionOf = (value: number | null | undefined, places: number): string => {
  if (value === null || value === undefined) return UNSEEN_THEORETICAL
  const [whole = "0", fraction = ""] = Math.abs(value).toFixed(places).split(".")
  return `${fractionSignOf(value, places)}¥${groupDigits(whole)}.${fraction}`
}

/**
 * A theoretical value too small for whole yen, to a fixed count of places,
 * marked the same way: `+¥1.2345`, `-¥0.0310`, `±¥0.0000`; its empty shape
 * for none.
 */
export const theoreticalFractionText = (amount: Amount<number | null | undefined>, places: number): string =>
  figured(amount, (value) => theoreticalFractionOf(value, places), (value) => fractionSignOf(value, places), `¥•.${"•".repeat(places)}`)
