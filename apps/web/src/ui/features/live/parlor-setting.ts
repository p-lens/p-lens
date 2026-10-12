import type { IsoDate } from "../../../core/calendar/calendar"
import type { SubmissionId } from "../../../core/parlor/parlor"
import type { SharedParlorId } from "../../../core/parlor/shared"
import type { PlayTerms } from "../../../core/parlor/terms"
import type { PlayGameKind } from "../../../core/play/play"
import type { ParlorChoice } from "./start-form"
import type { TermsForm } from "./start-terms"

/** What one press of a reading's buttons adds at one of the day's parlor's corners, where the person has set it: yen rented, tokens drawn. */
export interface PressAmounts {
  readonly rental?: number
  readonly draw?: number
}

/** The most digits a press's amount has. */
export const PRESS_DIGITS = 5

/**
 * The day's parlor setting: the parlor chosen and its corners' terms as
 * typed in the start form, and what a press of a reading's buttons adds
 * there, by the rate tokens rent at — a day may move from its ¥4 corner
 * to its ¥1 one, and a press differs between them. A day is spent at one parlor, so it is kept for the business day
 * it was made on and offered again to every play of that day.
 */
export interface ParlorSetting {
  readonly parlor: ParlorChoice
  readonly terms: Readonly<Record<PlayGameKind, TermsForm>>
  readonly presses: Readonly<Record<string, PressAmounts>>
}

/** A parlor setting as it is kept: with the business day it was made on. */
export const writtenParlorSetting = (day: IsoDate, setting: ParlorSetting): string =>
  JSON.stringify({ day, parlor: setting.parlor, terms: setting.terms, presses: setting.presses })

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const parlorOf = (value: unknown): ParlorChoice | undefined => {
  if (!isRecord(value)) return undefined
  if (value["type"] === "none") return { type: "none" }
  if (value["type"] === "listed" && typeof value["id"] === "string") return { type: "listed", id: value["id"] as SharedParlorId }
  if (value["type"] === "submitted" && typeof value["submission"] === "string") return { type: "submitted", submission: value["submission"] as SubmissionId }
  return undefined
}

const termsOf = (value: unknown): TermsForm | undefined => {
  if (!isRecord(value)) return undefined
  const { rentalTokens, exchangeTokens, replayPaidOut, replayDeducted } = value
  return typeof rentalTokens === "string" && typeof exchangeTokens === "string" && typeof replayPaidOut === "string" && typeof replayDeducted === "string"
    ? { rentalTokens, exchangeTokens, replayPaidOut, replayDeducted }
    : undefined
}

const isPressAmount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value < 10 ** PRESS_DIGITS

const amountsOf = (value: unknown): PressAmounts => {
  const kept = isRecord(value) ? value : {}
  return { ...(isPressAmount(kept["rental"]) ? { rental: kept["rental"] } : {}), ...(isPressAmount(kept["draw"]) ? { draw: kept["draw"] } : {}) }
}

/** The amounts kept for each rate, each where it reads as one; a setting kept before presses were set has none. */
const pressesOf = (value: unknown): ParlorSetting["presses"] =>
  Object.fromEntries(Object.entries(isRecord(value) ? value : {}).map(([rate, amounts]) => [rate, amountsOf(amounts)]))

/** The rate a corner's tokens rent at, as presses are kept under it; a play with no terms has one of its own. */
const rateOf = (terms: PlayTerms | undefined): string => (terms === undefined ? "none" : `${terms.rental.yen}/${terms.rental.tokens}`)

/** What a press adds at the corner of these terms, as the day's setting has it. */
export const pressesAt = (setting: ParlorSetting | undefined, terms: PlayTerms | undefined): PressAmounts => setting?.presses[rateOf(terms)] ?? {}

const settingOf = (kept: Readonly<Record<string, unknown>>): ParlorSetting | undefined => {
  const parlor = parlorOf(kept["parlor"])
  const terms = isRecord(kept["terms"]) ? kept["terms"] : {}
  const pachinko = termsOf(terms["pachinko"])
  const slot = termsOf(terms["slot"])
  return parlor === undefined || pachinko === undefined || slot === undefined ? undefined : { parlor, terms: { pachinko, slot }, presses: pressesOf(kept["presses"]) }
}

/** The parlor setting kept, if it was made on this business day and reads as one: yesterday's is not today's parlor. */
export const recalledParlorSetting = (written: string | undefined, day: IsoDate): ParlorSetting | undefined => {
  if (written === undefined) return undefined
  try {
    const kept: unknown = JSON.parse(written)
    return isRecord(kept) && kept["day"] === day ? settingOf(kept) : undefined
  } catch {
    return undefined
  }
}

/** What is kept with the presses at these terms' corner set as given; none where no parlor setting was made this business day, so there is nowhere to keep them. */
export const withPresses = (written: string | undefined, day: IsoDate, terms: PlayTerms | undefined, amounts: PressAmounts): string | undefined => {
  const setting = recalledParlorSetting(written, day)
  return setting === undefined ? undefined : writtenParlorSetting(day, { ...setting, presses: { ...setting.presses, [rateOf(terms)]: amounts } })
}
