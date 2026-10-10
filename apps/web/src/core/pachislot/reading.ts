import type { Checkpoint, Tally } from "../play-log/checkpoint"
import { Err, Ok, type Result } from "../result/result"

/**
 * The first line of a pachislot play's log: no games played and nothing
 * spent yet, and the data counter as it was found at the seat — the day's
 * games, each bonus, and the games since the last one.
 */
export const seatCheckpoint = (seat: { readonly total: number; readonly bonuses: Tally; readonly sinceBonus: number }, at: string): Checkpoint => ({
  spins: 0,
  outlay: 0,
  at,
  counter: { spins: seat.sinceBonus, total: seat.total, bonuses: seat.bonuses },
})

/** One reading of a pachislot data counter at the cabinet: the day's games and bonuses, and the outlay so far if it was given. */
export interface CounterInput {
  readonly total: number
  readonly bonuses: Tally
  readonly outlay: number | undefined
  readonly at: string
}

export type CounterRefusal =
  | { readonly type: "total-went-back"; readonly atLeast: number }
  | { readonly type: "outlay-went-back"; readonly atLeast: number }
  | { readonly type: "bonus-went-back"; readonly id: string; readonly atLeast: number }

/** Where the play's games are told from on the counter: its last reading of the day's games, or the play's start, counted as none. */
const anchorOf = (ordered: readonly Checkpoint[]): { readonly spins: number; readonly total: number } => {
  const reading = ordered.findLast((checkpoint) => checkpoint.counter?.total !== undefined)
  return { spins: reading?.spins ?? ordered.at(0)?.spins ?? 0, total: reading?.counter?.total ?? 0 }
}

/** The day's games the counter should be showing at least, by the log. */
export const totalNowOf = (ordered: readonly Checkpoint[]): number => {
  const anchor = anchorOf(ordered)
  return anchor.total + (ordered.at(-1)?.spins ?? 0) - anchor.spins
}

/** A bonus a reading counts fewer of than the counter last showed, with how many that was; a bonus the reading does not name is not asked about. */
const bonusBehind = (ordered: readonly Checkpoint[], bonuses: Tally): { readonly id: string; readonly atLeast: number } | undefined => {
  const shown = ordered.findLast((checkpoint) => checkpoint.counter?.bonuses !== undefined)?.counter?.bonuses ?? {}
  return Object.entries(shown)
    .map(([id, atLeast]) => ({ id, atLeast }))
    .find(({ id, atLeast }) => (bonuses[id] ?? atLeast) < atLeast)
}

/**
 * The line a counter reading adds, or why it cannot be added: the day's games
 * do not go back, nor does the outlay, nor the day's count of any bonus. The play's games are the reading's
 * games less those the counter showed at the anchor.
 */
export const checkpointForReading = (ordered: readonly Checkpoint[], input: CounterInput): Result<Checkpoint, CounterRefusal> => {
  const spent = ordered.findLast((checkpoint) => checkpoint.outlay !== undefined)?.outlay
  if (input.outlay !== undefined && spent !== undefined && input.outlay < spent) return Err({ type: "outlay-went-back", atLeast: spent })
  const shown = totalNowOf(ordered)
  if (input.total < shown) return Err({ type: "total-went-back", atLeast: shown })
  const behind = bonusBehind(ordered, input.bonuses)
  if (behind !== undefined) return Err({ type: "bonus-went-back", ...behind })
  const anchor = anchorOf(ordered)
  return Ok({
    spins: anchor.spins + input.total - anchor.total,
    ...(input.outlay === undefined ? {} : { outlay: input.outlay }),
    at: input.at,
    counter: { total: input.total, bonuses: input.bonuses },
  })
}

/** What has been counted so far, by id: the last tally in the log. */
export const tallyNowOf = (ordered: readonly Checkpoint[]): Tally => ordered.findLast((checkpoint) => checkpoint.tally !== undefined)?.tally ?? {}

/** Whether the player has started counting: a line with a tally is in the log. */
export const isCounting = (ordered: readonly Checkpoint[]): boolean => ordered.some((checkpoint) => checkpoint.tally !== undefined)

/** Games played since counting began. */
export const countedGamesOf = (ordered: readonly Checkpoint[]): number => {
  const start = ordered.find((checkpoint) => checkpoint.tally !== undefined)
  return start === undefined ? 0 : (ordered.at(-1)?.spins ?? 0) - start.spins
}

/** The line that starts counting: nothing counted yet, at the games last known. */
export const startCountingCheckpoint = (ordered: readonly Checkpoint[], at: string): Checkpoint => ({ spins: ordered.at(-1)?.spins ?? 0, at, tally: {} })

/**
 * The line a tap on a counting tile adds: the running tally with one more of
 * it, or one fewer — never below none — at the games last known. The next
 * counter reading says how many games the counting has covered.
 */
export const countCheckpoint = (ordered: readonly Checkpoint[], id: string, by: 1 | -1, at: string): Checkpoint => {
  const tally = tallyNowOf(ordered)
  return { spins: ordered.at(-1)?.spins ?? 0, at, tally: { ...tally, [id]: Math.max(0, (tally[id] ?? 0) + by) } }
}
