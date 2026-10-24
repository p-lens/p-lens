import type { SampleWork } from "../core/book"
import type { DayProblem } from "../core/day"
import type { DaysMade, Played } from "../port/sample-maker"

/** What the page asks the sample book's worker: play these days. */
export interface SampleCall {
  readonly work: SampleWork
}

/** What the worker tells the page: each day as it is played, then every day played, or why one could not be. */
export type SampleMessage = ({ readonly type: "day" } & DaysMade) | { readonly type: "played"; readonly played: Played } | { readonly type: "failed"; readonly problem: DayProblem }
