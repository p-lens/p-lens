import { releaseDateProblem, type ReleaseDateProblem } from "@p-lens/contracts"

import { type IsoDate, parseIsoDate } from "../calendar/calendar"
import { Err, Ok, type Result } from "../result/result"

/** Why a typed release date cannot be sent: none typed, not a day, or a day no machine can have come out on. */
export type ReleaseDateError = { readonly type: "missing" } | { readonly type: "not-a-date" } | { readonly type: ReleaseDateProblem }

/**
 * A machine's release date as typed, checked the way the shared catalog
 * checks it, so a person hears why before sending rather than after.
 */
export const readReleaseDate = (text: string, today: IsoDate): Result<IsoDate, ReleaseDateError> => {
  if (text.trim() === "") return Err({ type: "missing" })
  const day = parseIsoDate(text)
  if (!day.ok) return Err({ type: "not-a-date" })
  const problem = releaseDateProblem(day.value, today)
  return problem === undefined ? Ok(day.value) : Err({ type: problem })
}
