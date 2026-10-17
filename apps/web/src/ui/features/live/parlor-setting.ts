import type { IsoDate } from "../../../core/calendar/calendar"
import type { SubmissionId } from "../../../core/parlor/parlor"
import type { SharedParlorId } from "../../../core/parlor/shared"
import type { PlayGameKind } from "../../../core/play/play"
import type { ParlorChoice } from "./start-form"
import type { TermsForm } from "./start-terms"

/**
 * The day's parlor setting: the parlor chosen and its corners' terms as
 * typed in the start form. A day is spent at one parlor, so it is kept for
 * the business day it was made on and offered again to every play of that
 * day. What a press of a reading's buttons adds is no day's: it is kept
 * for good in the book's settings, corner by corner (`setPresses`).
 */
export interface ParlorSetting {
  readonly parlor: ParlorChoice
  readonly terms: Readonly<Record<PlayGameKind, TermsForm>>
}

/** A parlor setting as it is kept: with the business day it was made on. */
export const writtenParlorSetting = (day: IsoDate, setting: ParlorSetting): string =>
  JSON.stringify({ day, parlor: setting.parlor, terms: setting.terms })

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
  const { rentalTokens, exchange, replayPaidOut, replayDeducted } = value
  return typeof rentalTokens === "string" && typeof exchange === "string" && typeof replayPaidOut === "string" && typeof replayDeducted === "string"
    ? { rentalTokens, exchange, replayPaidOut, replayDeducted }
    : undefined
}

const settingOf = (kept: Readonly<Record<string, unknown>>): ParlorSetting | undefined => {
  const parlor = parlorOf(kept["parlor"])
  const terms = isRecord(kept["terms"]) ? kept["terms"] : {}
  const pachinko = termsOf(terms["pachinko"])
  const slot = termsOf(terms["slot"])
  return parlor === undefined || pachinko === undefined || slot === undefined ? undefined : { parlor, terms: { pachinko, slot } }
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
