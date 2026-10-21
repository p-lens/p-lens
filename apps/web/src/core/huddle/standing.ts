import type { Play } from "../live-play/draft-reading"
import type { HuddlePlay } from "./post"
import { parsePlayLog } from "../play-log/checkpoint"
import { inPlayOrder } from "../play-log/performance"

/**
 * Where one of the others' plays stands, as its log last says: over, in a
 * jackpot — an AT won, on a pachislot AT machine — in 時短, or being
 * played. 確変 is not said: nobody counts it.
 */
export type HuddleStanding = "finished" | "jackpot" | "rapid" | "playing"

export const huddleStandingOf = (play: Play): HuddleStanding => {
  const read = parsePlayLog(play.log)
  if (!read.ok) return "playing"
  if (read.value.some((checkpoint) => checkpoint.event?.kind === "finished")) return "finished"
  const last = inPlayOrder(read.value).at(-1)
  if (last?.event?.kind === "jackpot") return "jackpot"
  return play.gameKind === "pachinko" && last?.phase === "rapid" ? "rapid" : "playing"
}

/** Whether any of the others is in a jackpot on the play they are on: what one's own play's screen calls back to the day's list for. */
export const anyInJackpot = (plays: readonly HuddlePlay[]): boolean => plays.some((shown) => shown.latest && huddleStandingOf(shown.post.play) === "jackpot")
