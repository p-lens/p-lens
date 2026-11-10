import { exchangeOfStated, type PlayTerms } from "../../../core/parlor/terms"
import type { PlayGameKind } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import type { TermsForm } from "../live/start-terms"

/**
 * The odd-prize calculator as typed, each still text: the tokens taken to
 * the counter and the exchange as the game states it, for ¥100. The rental
 * is not asked: tokens taken to the counter are exchanged, not rented.
 */
export interface CalculatorForm {
  readonly tokens: string
  readonly exchange: string
}

export type CalculatorField = keyof CalculatorForm

/** The calculator as it opens on a corner's terms as a play's form states them, no tokens typed yet. */
export const calculatorFormOf = (terms: Pick<TermsForm, "exchange">): CalculatorForm => ({ tokens: "", exchange: terms.exchange })

const COUNT = /^\d+$/

/** A whole number above zero, commas allowed, or nothing. */
const countOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return COUNT.test(plain) && Number(plain) > 0 ? Number(plain) : undefined
}

/** What the calculator is asked: whole tokens at a corner's exchange. */
export interface CalculatorReading {
  readonly tokens: number
  readonly exchange: PlayTerms["exchange"]
}

/** What the form asks, or every field typed into that does not read; a field left empty is no mistake, only nothing asked yet. */
export const readCalculator = (form: CalculatorForm, gameKind: PlayGameKind): Result<CalculatorReading, readonly CalculatorField[]> => {
  const tokens = countOf(form.tokens)
  const exchange = exchangeOfStated(gameKind, tidyTyped(form.exchange).replaceAll(",", ""))
  if (tokens === undefined || exchange === undefined) {
    const unread: readonly (CalculatorField | false)[] = [tokens === undefined && "tokens", exchange === undefined && "exchange"]
    return Err(unread.filter((field): field is CalculatorField => field !== false && tidyTyped(form[field]) !== ""))
  }
  return Ok({ tokens, exchange })
}
