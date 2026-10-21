import type { Accessor } from "solid-js"

import { othersPlays } from "../../../core/huddle/post"
import { anyInJackpot } from "../../../core/huddle/standing"
import { useApp } from "../../context"

/** Whether one's own play's screen urges the way back to the day's list: any of the others in the huddle is in a jackpot, as the line was last read. */
export const useOthersInJackpot = (): Accessor<boolean> => {
  const app = useApp()
  return () => ((huddle) => huddle !== undefined && anyInJackpot(othersPlays(app.huddle.line.posts(), huddle.member)))(app.huddle.now())
}
