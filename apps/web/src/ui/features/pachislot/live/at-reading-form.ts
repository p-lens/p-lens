import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/** An AT machine's counter reading as typed: the games since the last AT, and the outlay so far. */
export interface AtReadingForm {
  readonly sinceAt: string
  readonly outlay: string
}

/** Where an AT machine's play stands as its counter should now show it: the games since the last AT, and the outlay where one was given. */
export interface AtStanding {
  readonly sinceAt: number
  readonly outlay: number | undefined
}

/** The form a reading is typed into: where the play stands, to be typed over. */
export const atReadingFrom = (standing: AtStanding): AtReadingForm => ({
  sinceAt: String(standing.sinceAt),
  outlay: standing.outlay === undefined || standing.outlay === 0 ? "" : String(standing.outlay),
})

export interface AtReadingProblem {
  readonly field: keyof AtReadingForm
  readonly reason: "required" | "not-a-count"
}

/** The reading as counts: the counter's games since the last AT, and the outlay if it was given. */
export interface AtReading {
  readonly sinceAt: number
  readonly outlay: number | undefined
}

const COUNT = /^\d+$/

const plainOf = (text: string): string => tidyTyped(text).replaceAll(",", "")

/** The form read as counts, or every field that cannot be. The games are required; an outlay left empty was not read. */
export const readAtReadingForm = (form: AtReadingForm): Result<AtReading, readonly AtReadingProblem[]> => {
  const sinceAt = plainOf(form.sinceAt)
  const outlay = plainOf(form.outlay)
  const problems: readonly AtReadingProblem[] = [
    ...(COUNT.test(sinceAt) ? [] : [{ field: "sinceAt", reason: sinceAt === "" ? "required" : "not-a-count" } as const]),
    ...(outlay === "" || COUNT.test(outlay) ? [] : [{ field: "outlay", reason: "not-a-count" } as const]),
  ]
  if (problems.length > 0) return Err(problems)
  return Ok({ sinceAt: Number(sinceAt), outlay: outlay === "" ? undefined : Number(outlay) })
}
