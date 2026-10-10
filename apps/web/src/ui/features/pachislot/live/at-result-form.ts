import type { Checkpoint, PlayEvent } from "../../../../core/play-log/checkpoint"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/** Whether an AT reached the 有利区間's cap, as answered: yes, no, or not said. */
export type Completion = "completed" | "short" | "unsaid"

/** How an AT went, as typed when it ends: whether it reached the cap, the sets it carried on to past its first, and the medals it gained. */
export interface AtResultForm {
  readonly completion: Completion
  readonly sets: string
  readonly medals: string
}

export const EMPTY_AT_RESULT: AtResultForm = { completion: "unsaid", sets: "", medals: "" }

export interface AtResultProblem {
  readonly field: "sets" | "medals"
  readonly reason: "not-a-count"
}

type AtEnded = Extract<PlayEvent, { readonly kind: "at-ended" }>

const COUNT = /^\d+$/

const plainOf = (text: string): string => tidyTyped(text).replaceAll(",", "")

/** A count as typed: none when left empty. */
const countOf = (text: string): number | undefined | "unreadable" => {
  const plain = plainOf(text)
  return plain === "" ? undefined : COUNT.test(plain) ? Number(plain) : "unreadable"
}

/** The result as an `at-ended` event, with only what was said; or every field that cannot be read. */
export const readAtResultForm = (form: AtResultForm): Result<AtEnded, readonly AtResultProblem[]> => {
  const sets = countOf(form.sets)
  const medals = countOf(form.medals)
  const problems: readonly AtResultProblem[] = [
    ...(sets === "unreadable" ? [{ field: "sets", reason: "not-a-count" } as const] : []),
    ...(medals === "unreadable" ? [{ field: "medals", reason: "not-a-count" } as const] : []),
  ]
  if (problems.length > 0 || sets === "unreadable" || medals === "unreadable") return Err(problems)
  return Ok({
    kind: "at-ended",
    ...(form.completion === "unsaid" ? {} : { completed: form.completion === "completed" }),
    ...(sets === undefined ? {} : { sets }),
    ...(medals === undefined ? {} : { medals }),
  })
}

/** Whether the log's last line is an AT won and nothing since: its result is still to be said. */
export const awaitsAtResult = (ordered: readonly Checkpoint[]): boolean => ordered.at(-1)?.event?.kind === "jackpot"

/** The line an AT's result is written as: on the games it was won on, since its own games are not regular ones. */
export const atResultLine = (ordered: readonly Checkpoint[], event: AtEnded, at: string): Result<readonly Checkpoint[], "no-at"> => {
  const last = ordered.at(-1)
  return last === undefined || !awaitsAtResult(ordered) ? Err("no-at") : Ok([{ spins: last.spins, at, event }])
}
