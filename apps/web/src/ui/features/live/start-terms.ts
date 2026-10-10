import type { PlayTerms } from "../../../core/parlor/terms"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"

/**
 * The sum a corner's rental and exchange are stated for. A board says them
 * as tokens for ¥1,000 — 250玉, 280玉 — so only the tokens are typed: with a
 * field for the sum too, 250 and 280 went into it and the rate came out a
 * quarter of what it was.
 */
export const TERMS_YEN = 1000

/**
 * A corner's terms as typed for one game, each still text: the tokens ¥1,000
 * rents, the tokens ¥1,000 is exchanged for, and a replay's two counts —
 * what it pays out and what it takes off the savings. Few corners take a fee
 * on a replay, and with none the two counts are the same.
 */
export interface TermsForm {
  readonly rentalTokens: string
  readonly exchangeTokens: string
  readonly replayPaidOut: string
  readonly replayDeducted: string
}

export type TermsField = keyof TermsForm

/** The form as it opens, from what a corner of the game usually has: the rates and the tokens a replay is stated for, typed over where the corner differs, the replay taking what it pays out. */
export const termsAsOpened = (usual: { readonly rentalTokens: string; readonly exchangeTokens: string; readonly replayTokens: string }): TermsForm => ({
  rentalTokens: usual.rentalTokens,
  exchangeTokens: usual.exchangeTokens,
  replayPaidOut: usual.replayTokens,
  replayDeducted: usual.replayTokens,
})

/** A sum's tokens as a board says them, for ¥1,000. */
const forTermsYen = (stated: { readonly yen: number; readonly tokens: number }): string => String((stated.tokens * TERMS_YEN) / stated.yen)

/** Terms as the form that states them: what a play is on, set out to be typed over. */
export const termsFormOf = (terms: PlayTerms): TermsForm => ({
  rentalTokens: forTermsYen(terms.rental),
  exchangeTokens: forTermsYen(terms.exchange),
  replayPaidOut: String(terms.replay.paidOut),
  replayDeducted: String(terms.replay.deducted),
})

/** Whether the counts typed say a replay takes a fee: it does unless it takes exactly what it pays out. */
export const replayFeeOf = (form: TermsForm): "none" | "charged" => (tidyTyped(form.replayPaidOut) !== "" && tidyTyped(form.replayPaidOut) === tidyTyped(form.replayDeducted) ? "none" : "charged")

const COUNT = /^\d+$/

/** A whole number above zero, commas allowed, or nothing. */
const countOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return COUNT.test(plain) && Number(plain) > 0 ? Number(plain) : undefined
}

const FIELDS: readonly TermsField[] = ["rentalTokens", "exchangeTokens", "replayPaidOut", "replayDeducted"]

/** The terms the form states, or every field that is not a whole number above zero. */
export const readTerms = (form: TermsForm): Result<PlayTerms, readonly TermsField[]> => {
  const [rentalTokens, exchangeTokens, paidOut, deducted] = FIELDS.map((field) => countOf(form[field]))
  if (rentalTokens === undefined || exchangeTokens === undefined || paidOut === undefined || deducted === undefined)
    return Err(FIELDS.filter((field) => countOf(form[field]) === undefined))
  return Ok({ rental: { yen: TERMS_YEN, tokens: rentalTokens }, exchange: { yen: TERMS_YEN, tokens: exchangeTokens }, replay: { paidOut, deducted } })
}

/**
 * Whether the terms typed say a replay pays out more than it takes from
 * the pool: a parlor never gives tokens away, so the two are most likely
 * the wrong way round. It is cautioned about and stops nothing.
 */
export const replayPaysMoreThanItTakes = (form: TermsForm): boolean => {
  const read = readTerms(form)
  return read.ok && read.value.replay.paidOut > read.value.replay.deducted
}
