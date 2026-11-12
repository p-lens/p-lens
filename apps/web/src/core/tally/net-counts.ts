import { parsePlayLog, type Checkpoint } from "../play-log/checkpoint"
import { liveSummary } from "../play-log/live"
import { inPlayOrder } from "../play-log/performance"
import type { NetCounts } from "./tally"

/** What a play followed live is of, for what its log counts: a pachinko machine, a pachislot machine with ATs or of bonuses alone, or a pachislot play with no formula to say which. */
export type CountedAs = NetCounts["type"]

/** The spins a pachinko play's log played in regular games: those up to a line in no 確変, 時短 or 残保留. */
const regularSpinsOf = (ordered: readonly Checkpoint[]): number =>
  ordered.reduce<{ readonly spins: number; readonly regular: number }>(
    (walked, checkpoint) => ({ spins: checkpoint.spins, regular: walked.regular + (checkpoint.phase === undefined || checkpoint.phase === "regular" ? checkpoint.spins - walked.spins : 0) }),
    { spins: ordered.at(0)?.spins ?? 0, regular: 0 },
  ).regular

/**
 * What a play's log counted of the person's own playing, finished: its
 * spins or games from the seat — and a pachinko play's regular games among
 * them — and its jackpots, ATs or bonuses, each jackpot of a run counted. None for a log that does not read.
 */
export const netCountsOf = (log: string, countedAs: CountedAs): NetCounts | undefined => {
  const parsed = parsePlayLog(log)
  if (!parsed.ok) return undefined
  const ordered = inPlayOrder(parsed.value)
  const summary = liveSummary(ordered)
  switch (countedAs) {
    case "pachinko":
      return { type: "pachinko", spins: summary.spins, regularSpins: regularSpinsOf(ordered), jackpots: summary.jackpots }
    case "at-machine":
      return { type: "at-machine", games: summary.spins, ats: summary.jackpots }
    case "bonus-machine":
      return { type: "bonus-machine", games: summary.spins, bonuses: summary.jackpots }
    case "games":
      return { type: "games", games: summary.spins }
  }
}
