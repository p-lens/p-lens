import type { Accessor } from "solid-js"

import type { HuddleTurn } from "../../../core/huddle/standing"
import { useApp } from "../../context"
import type { Urge } from "../shell/ViewHeader"

/** How loud each turn of the huddle's game urges the way back: a jackpot won is hot, one only ended is not. */
const URGES: Readonly<Record<HuddleTurn, Urge>> = { won: "loud", ended: "quiet" }

/** How one's own play's screen urges the way back to the day's list: as who of the others is in a jackpot turned since the list was last looked at (`HuddleRunner`), or not at all. */
export const useHuddleUrge = (): Accessor<Urge | undefined> => {
  const app = useApp()
  return () => ((turn) => (app.huddle.now() === undefined || turn === undefined ? undefined : URGES[turn]))(app.huddle.line.urged())
}
