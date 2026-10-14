import type { CountDto, SegmentDto } from "@p-lens/contracts/pachislot"

import type { Checkpoint, Counts } from "../play-log/checkpoint"
import { Err, Ok, type Result } from "../result/result"

/**
 * Why a play's log cannot be read as what was seen: the counter says fewer
 * games or bonuses for the day than the player saw while counting.
 */
export type ObservationProblem = { readonly type: "counter-below-counting"; readonly id: string | undefined }

/** A stretch of games and the counts seen in it, before it is handed to the engine. */
interface Stretch {
  readonly games: number
  readonly counts: Counts
}

const idsOf = (left: Counts, right: Counts): readonly string[] => [...new Set([...Object.keys(left), ...Object.keys(right)])]

const add = (left: Counts, right: Counts): Counts => Object.fromEntries(idsOf(left, right).map((id) => [id, (left[id] ?? 0) + (right[id] ?? 0)]))

const subtract = (left: Counts, right: Counts): Counts => Object.fromEntries(idsOf(left, right).map((id) => [id, (left[id] ?? 0) - (right[id] ?? 0)]))

/** The counts standing at a line of the log: the last carried at or before it, or nothing counted yet. */
const countsAt = (ordered: readonly Checkpoint[], index: number): Counts => ordered.slice(0, index + 1).findLast((checkpoint) => checkpoint.tally !== undefined)?.tally ?? {}

/** The bonuses among counts, each filed under what the counter shows it as — parts gathered into their bonus — and small wins left out. */
const onCounter = (counts: Counts, shownAs: (id: string) => string | undefined): Counts =>
  Object.entries(counts).reduce<Counts>((all, [id, count]) => {
    const shown = shownAs(id)
    return shown === undefined ? all : add(all, { [shown]: count })
  }, {})

/**
 * The day as far as it is known: the last counter reading that gives the
 * day's games, plus what was played and counted since; or, with no such
 * reading, the play alone.
 */
const dayOf = (ordered: readonly Checkpoint[], last: Checkpoint, shownAs: (id: string) => string | undefined): Stretch => {
  const index = ordered.findLastIndex((checkpoint) => checkpoint.counter?.total !== undefined)
  const reading = index < 0 ? undefined : ordered.at(index)
  const now = countsAt(ordered, ordered.length - 1)
  if (reading === undefined) return { games: last.spins, counts: onCounter(now, shownAs) }
  return {
    games: (reading.counter?.total ?? 0) + last.spins - reading.spins,
    counts: add(reading.counter?.bonuses ?? {}, onCounter(subtract(now, countsAt(ordered, index)), shownAs)),
  }
}

/** The day's games and bonuses as the log knows them now, for showing and for filling in the next reading; none before the play has a line. */
export const daySeenOf = (ordered: readonly Checkpoint[], shownAs: (id: string) => string | undefined): { readonly games: number; readonly bonuses: Counts } | undefined => {
  const last = ordered.at(-1)
  if (last === undefined) return undefined
  const day = dayOf(ordered, last, shownAs)
  return { games: day.games, bonuses: day.counts }
}

const difference =(whole: Stretch, part: Stretch): Result<Stretch, ObservationProblem> => {
  const counts = subtract(whole.counts, part.counts)
  const short = Object.entries(counts).find(([, count]) => count < 0)?.[0]
  if (whole.games < part.games) return Err({ type: "counter-below-counting", id: undefined })
  if (short !== undefined) return Err({ type: "counter-below-counting", id: short })
  return Ok({ games: whole.games - part.games, counts })
}

const segmentOf = (stretch: Stretch): SegmentDto => ({
  games: stretch.games,
  counts: Object.entries(stretch.counts).map(([id, count]): CountDto => ({ id, count })),
})

/**
 * What a pachislot play's log says was seen, as the stretches the engine
 * infers the setting from. The day's games and bonuses come from the data
 * counter where it was read; the stretch the player counted in is kept
 * apart, with everything counted in it — bonuses part by part, when the
 * player told 単独 from 重複 — and the rest of the day carries what is left.
 *
 * `shownAs` names the bonus the counter shows a bonus or a part as (`reg-solo`
 * as `reg`), and nothing for a small win.
 */
export const segmentsOf = (ordered: readonly Checkpoint[], shownAs: (id: string) => string | undefined): Result<readonly SegmentDto[], ObservationProblem> => {
  const last = ordered.at(-1)
  if (last === undefined) return Ok([])
  const day = dayOf(ordered, last, shownAs)
  const start = ordered.find((checkpoint) => checkpoint.tally !== undefined)
  if (start === undefined) return Ok([segmentOf(day)])
  const counted: Stretch = { games: last.spins - start.spins, counts: subtract(countsAt(ordered, ordered.length - 1), start.tally ?? {}) }
  const rest = difference(day, { games: counted.games, counts: onCounter(counted.counts, shownAs) })
  if (!rest.ok) return rest
  return Ok([rest.value, counted].filter((stretch) => stretch.games > 0).map(segmentOf))
}
