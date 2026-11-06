import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"
import type { Handing } from "./reading-form"

/** An AT machine's counter reading as typed: the games since the last AT, the outlay and the medals drawn from savings so far, and the medals in hand, `heldCarried` where they are the last count carried over and not counted again; and the medals handed to or by other players since the reading before, the way they went `handing`. */
export interface AtReadingForm {
  readonly sinceAt: string
  readonly outlay: string
  readonly replay: string
  readonly held: string
  readonly heldCarried: boolean
  readonly handed: string
  readonly handing: Handing
}

/** Where an AT machine's play stands as its counter should now show it: the games since the last AT, the outlay and the medals drawn from savings, and the medals in hand as last counted, each where it was given. */
export interface AtStanding {
  readonly sinceAt: number
  readonly outlay: number | undefined
  readonly replay: number | undefined
  readonly held: number | undefined
}

/** The form a reading is typed into: where the play stands, to be typed over, the medals in hand as last counted carried over until counted again. */
export const atReadingFrom = (standing: AtStanding): AtReadingForm => ({
  sinceAt: String(standing.sinceAt),
  outlay: standing.outlay === undefined || standing.outlay === 0 ? "" : String(standing.outlay),
  replay: standing.replay === undefined || standing.replay === 0 ? "" : String(standing.replay),
  held: standing.held === undefined ? "" : String(standing.held),
  heldCarried: standing.held !== undefined,
  handed: "",
  handing: "given",
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
  /** Medals other players handed in since the reading before, below none where they were handed away. */
  readonly handed: number
}

const COUNT = /^\d+$/

const plainOf = (text: string): string => tidyTyped(text).replaceAll(",", "")

/** Medals handed as typed, signed by the way they went: none where nothing, or nought, is typed. */
const handedOf = (typed: string, handing: Handing): number => (typed === "" || Number(typed) === 0 ? 0 : handing === "given" ? -Number(typed) : Number(typed))

/** The form read as counts, or every field that cannot be. The games are required; an outlay, a draw on savings or the medals in hand left empty was not read, nor medals in hand carried over and not counted again. The medals in hand typed are those before the handing, and the reading counts them after it: what was typed with what was handed. */
export const readAtReadingForm = (form: AtReadingForm): Result<AtReading, readonly AtReadingProblem[]> => {
  const sinceAt = plainOf(form.sinceAt)
  const outlay = plainOf(form.outlay)
  const replay = plainOf(form.replay)
  const held = form.heldCarried ? "" : plainOf(form.held)
  const handed = plainOf(form.handed)
  const problems: readonly AtReadingProblem[] = [
    ...(COUNT.test(sinceAt) ? [] : [{ field: "sinceAt", reason: sinceAt === "" ? "required" : "not-a-count" } as const]),
    ...(outlay === "" || COUNT.test(outlay) ? [] : [{ field: "outlay", reason: "not-a-count" } as const]),
    ...(replay === "" || COUNT.test(replay) ? [] : [{ field: "replay", reason: "not-a-count" } as const]),
    ...(held === "" || COUNT.test(held) ? [] : [{ field: "held", reason: "not-a-count" } as const]),
    ...(handed === "" || COUNT.test(handed) ? [] : [{ field: "handed", reason: "not-a-count" } as const]),
  ]
  if (problems.length > 0) return Err(problems)
  const handedCount = handedOf(handed, form.handing)
  return Ok({ sinceAt: Number(sinceAt), outlay: outlay === "" ? undefined : Number(outlay), replay: replay === "" ? undefined : Number(replay), held: held === "" ? undefined : Number(held) + handedCount, handed: handedCount })
}
