import { createSignal, type Accessor, type Setter } from "solid-js"

import type { HuddleEntry } from "../../../core/huddle/post"
import type { HuddleTurn } from "../../../core/huddle/standing"
import type { HuddleLine as OpenLine, HuddleProblem } from "../../../crossing"
import { NOT_YET, type Reach } from "../../primitives/reach"

/**
 * What the page has of a huddle's line, kept for as long as the page is
 * open rather than as long as one screen is: the line is kept open and the
 * device's plays shown wherever the app is (`HuddleRunner`), and the day's
 * list and the others' plays are drawn from what was read.
 *
 * - `secret`: the huddle the rest is of; another's begins it all again.
 * - `line`: the line, open on its relay, while the runner keeps it up.
 * - `shownAt`: when this device last showed its plays, in milliseconds.
 * - `shown`: each of its plays' log as it was last shown, by its id.
 * - `arrived`: whether it has said it came in, under the name it goes by, since the line was taken up.
 *
 * `heard` is how reading the line stands, the others' plays as the page has
 * them; `told` how showing this device's own plays there does. Each is
 * kept apart, so a read that goes through never hides a showing that
 * fails.
 *
 * `keptUp` is the huddle the runner keeps up now, by its secret: the room
 * on the rail is there while it is, and goes as the runner stops.
 */
export interface HuddleLine {
  readonly entries: Accessor<readonly HuddleEntry[]>
  readonly setEntries: Setter<readonly HuddleEntry[]>
  readonly heard: Accessor<Reach<HuddleProblem>>
  readonly setHeard: Setter<Reach<HuddleProblem>>
  readonly told: Accessor<Reach<HuddleProblem>>
  readonly setTold: Setter<Reach<HuddleProblem>>
  /** How who of the others is in a jackpot turned since the day's list was last looked at — a jackpot won, or only ended — or nothing: one's own play's screen urges the way back to it until it is. */
  readonly urged: Accessor<HuddleTurn | undefined>
  readonly setUrged: Setter<HuddleTurn | undefined>
  readonly keptUp: Accessor<string | undefined>
  readonly setKeptUp: Setter<string | undefined>
  readonly held: { secret: string | undefined; line: OpenLine | undefined; shownAt: number; shown: ReadonlyMap<string, string>; arrived: boolean }
}

export const createHuddleLine = (): HuddleLine => {
  const [entries, setEntries] = createSignal<readonly HuddleEntry[]>([])
  const [heard, setHeard] = createSignal<Reach<HuddleProblem>>(NOT_YET)
  const [told, setTold] = createSignal<Reach<HuddleProblem>>(NOT_YET)
  const [urged, setUrged] = createSignal<HuddleTurn | undefined>(undefined)
  const [keptUp, setKeptUp] = createSignal<string | undefined>(undefined)
  return { entries, setEntries, heard, setHeard, told, setTold, urged, setUrged, keptUp, setKeptUp, held: { secret: undefined, line: undefined, shownAt: 0, shown: new Map(), arrived: false } }
}
