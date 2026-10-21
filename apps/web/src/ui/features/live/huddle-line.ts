import { createSignal, type Accessor, type Setter } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import type { HuddleEntry } from "../../../core/huddle/post"
import type { HuddleTurn } from "../../../core/huddle/standing"

/**
 * What the page has of a huddle's line, kept for as long as the page is
 * open rather than as long as one screen is: the line is read and the
 * device's plays shown wherever the app is (`HuddleRunner`), and the
 * day's list and the others' plays are drawn from what was read.
 *
 * - `secret`: the huddle the rest is of; another's begins it all again.
 * - `read`: where the line has been read to.
 * - `lineEnd`: where it was last seen to end, read or shown to.
 * - `shownAt`: when this device last showed its plays, in milliseconds.
 * - `shown`: each of its plays' log as it was last shown, by its id.
 * - `reading`: a reading on its way, which another waits behind.
 */
export interface HuddleLine {
  readonly entries: Accessor<readonly HuddleEntry[]>
  readonly setEntries: Setter<readonly HuddleEntry[]>
  readonly problem: Accessor<ApplicationError | undefined>
  readonly setProblem: Setter<ApplicationError | undefined>
  /** How who of the others is in a jackpot turned since the day's list was last looked at — a jackpot won, or only ended — or nothing: one's own play's screen urges the way back to it until it is. */
  readonly urged: Accessor<HuddleTurn | undefined>
  readonly setUrged: Setter<HuddleTurn | undefined>
  readonly held: { secret: string | undefined; read: number; lineEnd: number; shownAt: number; shown: ReadonlyMap<string, string>; reading: boolean }
}

export const createHuddleLine = (): HuddleLine => {
  const [entries, setEntries] = createSignal<readonly HuddleEntry[]>([])
  const [problem, setProblem] = createSignal<ApplicationError | undefined>()
  const [urged, setUrged] = createSignal<HuddleTurn | undefined>(undefined)
  return { entries, setEntries, problem, setProblem, urged, setUrged, held: { secret: undefined, read: 0, lineEnd: 0, shownAt: 0, shown: new Map(), reading: false } }
}
