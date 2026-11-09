import { parsePlayLog } from "../play-log/checkpoint"
import { liveSummary } from "../play-log/live"
import { inPlayOrder } from "../play-log/performance"
import type { NetCounts } from "./tally"

/** What a play followed live is of, for what its log counts: a pachinko machine, a pachislot machine with ATs or of bonuses alone, or a pachislot play with no formula to say which. */
export type CountedAs = NetCounts["type"]

/**
 * What a play's log counted of the person's own playing, finished: its
 * spins or games from the seat, and its jackpots, ATs or bonuses, each
 * jackpot of a run counted. None for a log that does not read.
 */
export const netCountsOf = (log: string, countedAs: CountedAs): NetCounts | undefined => {
  const parsed = parsePlayLog(log)
  if (!parsed.ok) return undefined
  const summary = liveSummary(inPlayOrder(parsed.value))
  switch (countedAs) {
    case "pachinko":
      return { type: "pachinko", spins: summary.spins, jackpots: summary.jackpots }
    case "at-machine":
      return { type: "at-machine", games: summary.spins, ats: summary.jackpots }
    case "bonus-machine":
      return { type: "bonus-machine", games: summary.spins, bonuses: summary.jackpots }
    case "games":
      return { type: "games", games: summary.spins }
  }
}
