import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/** An AT machine's counter reading as typed: the games since the last AT, the outlay and the medals drawn from savings so far, and the medals in hand. */
export interface AtReadingForm {
  readonly sinceAt: string
  readonly outlay: string
  readonly replay: string
  readonly held: string
}

/** Where an AT machine's play stands as its counter should now show it: the games since the last AT, and the outlay and the medals drawn from savings, each where it was given. */
export interface AtStanding {
  readonly sinceAt: number
  readonly outlay: number | undefined
  readonly replay: number | undefined
}

/** The form a reading is typed into: where the play stands, to be typed over, and the medals in hand empty, counted afresh or not at all. */
export const atReadingFrom = (standing: AtStanding): AtReadingForm => ({
  sinceAt: String(standing.sinceAt),
  outlay: standing.outlay === undefined || standing.outlay === 0 ? "" : String(standing.outlay),
  replay: standing.replay === undefined || standing.replay === 0 ? "" : String(standing.replay),
  held: "",
})

export interface AtReadingProblem {
  readonly field: keyof AtReadingForm
  readonly reason: "required" | "not-a-count"
}

/** The reading as counts: the counter's games since the last AT, the outlay and the medals drawn from savings, and the medals in hand, each if it was given. */
export interface AtReading {
  readonly sinceAt: number
  readonly outlay: number | undefined
  readonly replay: number | undefined
  readonly held: number | undefined
}

const COUNT = /^\d+$/

const plainOf = (text: string): string => tidyTyped(text).replaceAll(",", "")

/** The form read as counts, or every field that cannot be. The games are required; an outlay, a draw on savings or the medals in hand left empty was not read. */
export const readAtReadingForm = (form: AtReadingForm): Result<AtReading, readonly AtReadingProblem[]> => {
  const sinceAt = plainOf(form.sinceAt)
  const outlay = plainOf(form.outlay)
  const replay = plainOf(form.replay)
  const held = plainOf(form.held)
  const problems: readonly AtReadingProblem[] = [
    ...(COUNT.test(sinceAt) ? [] : [{ field: "sinceAt", reason: sinceAt === "" ? "required" : "not-a-count" } as const]),
    ...(outlay === "" || COUNT.test(outlay) ? [] : [{ field: "outlay", reason: "not-a-count" } as const]),
    ...(replay === "" || COUNT.test(replay) ? [] : [{ field: "replay", reason: "not-a-count" } as const]),
    ...(held === "" || COUNT.test(held) ? [] : [{ field: "held", reason: "not-a-count" } as const]),
  ]
  if (problems.length > 0) return Err(problems)
  return Ok({ sinceAt: Number(sinceAt), outlay: outlay === "" ? undefined : Number(outlay), replay: replay === "" ? undefined : Number(replay), held: held === "" ? undefined : Number(held) })
}
