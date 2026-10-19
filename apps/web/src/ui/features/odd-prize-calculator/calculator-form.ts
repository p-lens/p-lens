import { exchangeOfStated, type PlayTerms } from "../../../core/parlor/terms"
import type { PlayGameKind } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import type { TermsForm } from "../live/start-terms"

/** The sum a rental is stated for, as at the start of a play: tokens for ¥1,000. */
const RENTAL_YEN = 1000

/**
 * The odd-prize calculator as typed, each still text: the tokens taken to
 * the counter, the tokens ¥1,000 rents, and the exchange as the game
 * states it, for ¥100.
 */
export interface CalculatorForm {
  readonly tokens: string
  readonly rentalTokens: string
  readonly exchange: string
}

export type CalculatorField = keyof CalculatorForm

/** The calculator as it opens on a corner's terms as a play's form states them, no tokens typed yet. */
export const calculatorFormOf = (terms: Pick<TermsForm, "rentalTokens" | "exchange">): CalculatorForm => ({ tokens: "", rentalTokens: terms.rentalTokens, exchange: terms.exchange })

const COUNT = /^\d+$/

/** A whole number above zero, commas allowed, or nothing. */
const countOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return COUNT.test(plain) && Number(plain) > 0 ? Number(plain) : undefined
}

/** What the calculator is asked: whole tokens at a corner's rental and exchange. */
export interface CalculatorReading {
  readonly tokens: number
  readonly terms: Pick<PlayTerms, "rental" | "exchange">
}

/** What the form asks, or every field typed into that does not read; a field left empty is no mistake, only nothing asked yet. */
export const readCalculator = (form: CalculatorForm, gameKind: PlayGameKind): Result<CalculatorReading, readonly CalculatorField[]> => {
  const tokens = countOf(form.tokens)
  const rentalTokens = countOf(form.rentalTokens)
  const exchange = exchangeOfStated(gameKind, tidyTyped(form.exchange).replaceAll(",", ""))
  if (tokens === undefined || rentalTokens === undefined || exchange === undefined) {
    const unread: readonly (CalculatorField | false)[] = [tokens === undefined && "tokens", rentalTokens === undefined && "rentalTokens", exchange === undefined && "exchange"]
    return Err(unread.filter((field): field is CalculatorField => field !== false && tidyTyped(form[field]) !== ""))
  }
  return Ok({ tokens, terms: { rental: { yen: RENTAL_YEN, tokens: rentalTokens }, exchange } })
}
