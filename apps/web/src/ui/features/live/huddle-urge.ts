import type { Accessor } from "solid-js"

import { useApp } from "../../context"

/** Whether one's own play's screen urges the way back to the day's list: who of the others is in a jackpot changed since the list was last looked at (`HuddleRunner`). */
export const useHuddleUrge = (): Accessor<boolean> => {
  const app = useApp()
  return () => app.huddle.now() !== undefined && app.huddle.line.urged()
}
