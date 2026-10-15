import { exchangeOfStated, statedExchangeOf, type PlayTerms } from "../../../core/parlor/terms"
import type { PlayGameKind } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"

/**
 * The sum a corner's rental is stated for. A board says it as tokens for
 * ¥1,000 — 250玉, 46枚 — so only the tokens are typed: with a field for the
 * sum too, 250 and 280 went into it and the rate came out a quarter of what
 * it was. The exchange is stated as each game states it (`exchangeOfStated`).
 */
const TERMS_YEN = 1000

/**
 * A corner's terms as typed for one game, each still text: the tokens ¥1,000
 * rents, the exchange as the game states it, for ¥100 — 28玉, 5.1枚 —
 * and a replay's two counts —
 * what it pays out and what it takes off the savings. Few corners take a fee
 * on a replay, and with none the two counts are the same.
 */
export interface TermsForm {
  readonly rentalTokens: string
  readonly exchange: string
  readonly replayPaidOut: string
  readonly replayDeducted: string
}

export type TermsField = keyof TermsForm

/** The form as it opens, from what a corner of the game usually has: the rates and the tokens a replay is stated for, typed over where the corner differs, the replay taking what it pays out. */
export const termsAsOpened = (usual: { readonly rentalTokens: string; readonly exchange: string; readonly replayTokens: string }): TermsForm => ({
  rentalTokens: usual.rentalTokens,
  exchange: usual.exchange,
  replayPaidOut: usual.replayTokens,
  replayDeducted: usual.replayTokens,
})

/** A rental's tokens as a board says them, for ¥1,000. */
const forTermsYen = (stated: { readonly yen: number; readonly tokens: number }): string => String((stated.tokens * TERMS_YEN) / stated.yen)

/** Terms as the form that states them for a game: what a play is on, set out to be typed over. */
export const termsFormOf = (terms: PlayTerms, gameKind: PlayGameKind): TermsForm => ({
  rentalTokens: forTermsYen(terms.rental),
  exchange: statedExchangeOf(gameKind, terms.exchange),
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

/** The terms the form states for a game, or every field that does not read: a count not a whole number above zero, an exchange not one as the game states it. */
export const readTerms = (form: TermsForm, gameKind: PlayGameKind): Result<PlayTerms, readonly TermsField[]> => {
  const [rentalTokens, paidOut, deducted] = [form.rentalTokens, form.replayPaidOut, form.replayDeducted].map(countOf)
  const exchange = exchangeOfStated(gameKind, tidyTyped(form.exchange).replaceAll(",", ""))
  if (rentalTokens === undefined || exchange === undefined || paidOut === undefined || deducted === undefined) {
    const unread: readonly (TermsField | false)[] = [rentalTokens === undefined && "rentalTokens", exchange === undefined && "exchange", paidOut === undefined && "replayPaidOut", deducted === undefined && "replayDeducted"]
    return Err(unread.filter((field) => field !== false))
  }
  return Ok({ rental: { yen: TERMS_YEN, tokens: rentalTokens }, exchange, replay: { paidOut, deducted } })
}

/**
 * Whether the terms typed say a replay pays out more than it takes from
 * the pool: a parlor never gives tokens away, so the two are most likely
 * the wrong way round. It is cautioned about and stops nothing.
 */
export const replayPaysMoreThanItTakes = (form: TermsForm): boolean => {
  const [paidOut, deducted] = [countOf(form.replayPaidOut), countOf(form.replayDeducted)]
  return paidOut !== undefined && deducted !== undefined && paidOut > deducted
}
