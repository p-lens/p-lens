import type { Checkpoint } from "../play-log/checkpoint"
import type { Result } from "../result/result"
import type { ReadingHand } from "./reading"
import { revised, takenOf, type RevisionRefusal, type Taken } from "./revision"

/** A run of a play's readings, by the places of its first and its last among them. */
export interface Span {
  readonly from: number
  readonly to: number
}

/** A reading with the regular games the play had come to by it. */
interface Weighed {
  readonly taken: Taken
  readonly regularSpins: number
}

const weighedOf = (ordered: readonly Checkpoint[]): readonly Weighed[] =>
  takenOf(ordered).reduce<{ readonly weighed: readonly Weighed[]; readonly counter: number; readonly regularSpins: number }>(
    (walked, taken) => {
      const advanced = taken.reading.counterSpins - (taken.afterMissedJackpot ? 0 : walked.counter)
      const regularSpins = walked.regularSpins + (taken.reading.phase === "regular" ? advanced : 0)
      return { weighed: [...walked.weighed, { taken, regularSpins }], counter: taken.reading.jackpot.type === "none" ? taken.reading.counterSpins : 0, regularSpins }
    },
    { weighed: [], counter: ordered.at(0)?.counter?.spins ?? 0, regularSpins: 0 },
  ).weighed

/**
 * Whether a reading and the one after it may be made one. Not across a
 * jackpot, which starts the counter over and is a line of its own, and
 * not across a change of the state the cabinet was in, which a single
 * line cannot say of two stretches. Nor is either a reading a jackpot
 * nobody wrote down was admitted before: that jackpot is known only by
 * the counter having gone back at that reading, and would be lost with
 * it.
 */
const joins = (earlier: Taken, later: Taken): boolean =>
  earlier.reading.jackpot.type === "none" && earlier.reading.phase === later.reading.phase && !earlier.afterMissedJackpot && !later.afterMissedJackpot

/** The place a run from one reading reaches towards another, each reading joined to the next: the other's, or the last before a line that does not join. */
const stretched = (weighed: readonly Weighed[], at: number, reached: number): number => {
  if (at === reached) return at
  const next = at + Math.sign(reached - at)
  const earlier = weighed[Math.min(at, next)]
  const later = weighed[Math.max(at, next)]
  return earlier !== undefined && later !== undefined && joins(earlier.taken, later.taken) ? stretched(weighed, next, reached) : at
}

/** Whether a reading says what was in hand: the balls counted, or balls bought, which says the hand had run out — but not at a jackpot, which may have come before what was bought there was played (`consumptionOf`). */
const knowsTheHand = ({ reading }: Taken): boolean => reading.held !== undefined || (reading.jackpot.type === "none" && (reading.rented > 0 || reading.replayed > 0))

const spanBetween = (one: number, other: number): Span => ({ from: Math.min(one, other), to: Math.max(one, other) })

/**
 * The run of readings that may be made one, from the reading at `anchor`
 * towards the one at `reached`: as far as each joins the next. A reading
 * alone, where nothing may be made one with it.
 */
export const mergeableSpan = (ordered: readonly Checkpoint[], anchor: number, reached: number): Span => spanBetween(anchor, stretched(weighedOf(ordered), anchor, reached))

/** A point inside a run where the hand was known, as the run's one reading will say it, with the regular games the play had come to there. */
interface Point {
  readonly hand: ReadingHand
  readonly regularSpins: number
}

/** What a run's readings before one had rented, drawn and drifted in all. */
interface Since {
  readonly rented: number
  readonly replayed: number
  readonly supported: number
}

/** A reading's own hand where it knew one: what it counted, or none left as it bought more. */
const handOf = ({ reading }: Taken, since: Since): ReadingHand => ({
  counterSpins: reading.counterSpins,
  rented: since.rented + reading.rented,
  replayed: since.replayed + reading.replayed,
  supported: since.supported + reading.supported,
  held: reading.held ?? 0,
  ...(reading.held === undefined ? {} : { counted: true as const }),
})

/**
 * Every point inside a run where the hand was known, oldest first: the
 * hands its readings already kept from folds before, and every reading but
 * the last that knew the hand, each said from the line before the run.
 */
const pointsOf = (run: readonly Weighed[]): readonly Point[] =>
  run.reduce<{ readonly points: readonly Point[]; readonly since: Since }>(
    (walked, { taken, regularSpins }, index) => {
      const back = (counterSpins: number): number => regularSpins - (taken.reading.phase === "regular" ? taken.reading.counterSpins - counterSpins : 0)
      const kept = (taken.reading.handsBefore ?? []).map((hand) => ({
        hand: { ...hand, rented: walked.since.rented + hand.rented, replayed: walked.since.replayed + hand.replayed, supported: walked.since.supported + hand.supported },
        regularSpins: back(hand.counterSpins),
      }))
      const own = index < run.length - 1 && knowsTheHand(taken) ? [{ hand: handOf(taken, walked.since), regularSpins }] : []
      return {
        points: [...walked.points, ...kept, ...own],
        since: { rented: walked.since.rented + taken.reading.rented, replayed: walked.since.replayed + taken.reading.replayed, supported: walked.since.supported + taken.reading.supported },
      }
    },
    { points: [], since: { rented: 0, replayed: 0, supported: 0 } },
  ).points

/**
 * The points a run's one reading must keep for the play to stand as it
 * did: for it to be measured as it was (`consumptionOf`), the last before
 * any regular game, which the measuring may start from, and — where the
 * last reading does not know the hand itself — the last of all, which it
 * may end at; and, where the last reading counted nothing, the last count,
 * which the hand is told from (`heldAsToldOf`). No other is ever read.
 */
const keptPoints = (points: readonly Point[], last: Taken): readonly ReadingHand[] => {
  const start = points.findLast((point) => point.regularSpins === 0)
  const end = knowsTheHand(last) ? undefined : points.at(-1)
  const count = last.reading.held === undefined ? points.findLast((point) => point.hand.counted === true) : undefined
  return points.filter((point) => point === start || point === end || point === count).map((point) => point.hand)
}

/**
 * The 遊 counter a run's one reading says: the last's, or the latest said
 * inside the run, carried to the last's data counter — a run crosses no
 * jackpot before its last reading, so the two counters keep their distance
 * through it.
 */
const gaugeOfRun = (run: readonly Weighed[], last: Taken): number | undefined => {
  const said = run.findLast(({ taken }) => taken.reading.gauge !== undefined)?.taken.reading
  return said?.gauge === undefined ? undefined : said.gauge + last.reading.counterSpins - said.counterSpins
}

/**
 * A run of readings as the one it makes: the last, with all that was
 * rented, drawn and drifted over the run, and the points inside it where
 * the hand was known that the play is measured by.
 */
const mergedOf = (run: readonly Weighed[]): Taken | undefined => {
  const last = run.at(-1)?.taken
  if (last === undefined) return undefined
  const hands = keptPoints(pointsOf(run), last)
  const gauge = gaugeOfRun(run, last)
  const { handsBefore: _, gauge: _gauge, ...reading } = last.reading
  return {
    ...last,
    reading: {
      ...reading,
      rented: run.reduce((sum, each) => sum + each.taken.reading.rented, 0),
      replayed: run.reduce((sum, each) => sum + each.taken.reading.replayed, 0),
      supported: run.reduce((sum, each) => sum + each.taken.reading.supported, 0),
      ...(hands.length === 0 ? {} : { handsBefore: hands }),
      ...(gauge === undefined ? {} : { gauge }),
    },
  }
}

/**
 * The log with a run of its readings made one line: the counter, the
 * balls in hand and the hour as the last read them, what was rented,
 * drawn and drifted over the run in all, and the points inside it where the
 * hand was known that the play is measured by (`handsBefore`). The play's
 * totals, and what it is measured by, stand as they were; only the lines
 * between are gone. A span that may not be made one whole — past a
 * jackpot, a change of the cabinet's state — is made one as far as it may
 * be (`mergeableSpan`), from its first reading.
 */
export const withReadingsMerged = (ordered: readonly Checkpoint[], span: Span): Result<readonly Checkpoint[], RevisionRefusal> => {
  const { from, to } = mergeableSpan(ordered, span.from, span.to)
  const weighed = weighedOf(ordered)
  return revised(ordered, (taken) => {
    const merged = mergedOf(weighed.slice(from, to + 1))
    return merged === undefined ? taken : [...taken.slice(0, from), merged, ...taken.slice(to + 1)]
  })
}
