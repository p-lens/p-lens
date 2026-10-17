import type { Checkpoint } from "../play-log/checkpoint"
import { Err, Ok, type Result } from "../result/result"
import { checkpointsForReading, type Jackpot, type Reading, type ReadingRefusal } from "./reading"

/**
 * One reading as it was taken, read back out of a play's log: what was
 * typed, not the running totals it left. `afterMissedJackpot` says the
 * reading was kept with a jackpot nobody wrote down admitted before it.
 */
export interface Taken {
  readonly reading: Reading
  readonly afterMissedJackpot: boolean
}

/**
 * Why a play's readings, changed, do not make a log: the one at `index`
 * shows less on the counter than it must after the one before, so a jackpot
 * would have had to come unseen between them.
 */
export interface RevisionRefusal {
  readonly type: "counter-went-back"
  readonly index: number
  readonly expectedAtLeast: number
}

const isMissedJackpot = (checkpoint: Checkpoint): boolean => checkpoint.event?.kind === "jackpot" && checkpoint.event.approximate === true

const jackpotOf = (checkpoint: Checkpoint): Jackpot => {
  if (checkpoint.event?.kind !== "jackpot") return { type: "none" }
  return checkpoint.event.bonus === undefined ? { type: "untold" } : { type: "bonus", bonus: checkpoint.event.bonus }
}

/** A play's totals as a line leaves them, a line that says nothing of one leaving it as it was. */
interface Totals {
  readonly outlay: number
  readonly replay: number
  readonly support: number
}

const totalsAfter = (before: Totals, checkpoint: Checkpoint): Totals => ({
  outlay: checkpoint.outlay ?? before.outlay,
  replay: checkpoint.replay ?? before.replay,
  support: checkpoint.support ?? before.support,
})

/**
 * The readings a play's log was made of, in order, after its first line —
 * the seat as it was found, which is not a reading. A jackpot found
 * missing is no reading of its own: it belongs to the reading it was
 * admitted with.
 */
export const takenOf = (ordered: readonly Checkpoint[]): readonly Taken[] =>
  ordered.slice(1).reduce<{ readonly taken: readonly Taken[]; readonly totals: Totals; readonly missed: boolean }>(
    (walked, checkpoint) => {
      if (isMissedJackpot(checkpoint)) return { ...walked, missed: true }
      const totals = totalsAfter(walked.totals, checkpoint)
      const reading: Reading = {
        counterSpins: checkpoint.counter?.spins ?? 0,
        phase: checkpoint.phase ?? "regular",
        rented: totals.outlay - walked.totals.outlay,
        replayed: totals.replay - walked.totals.replay,
        supported: totals.support - walked.totals.support,
        held: checkpoint.held,
        jackpot: jackpotOf(checkpoint),
        at: checkpoint.at ?? "",
        ...(checkpoint.counter?.gauge === undefined ? {} : { gauge: checkpoint.counter.gauge }),
        ...(checkpoint.handsBefore === undefined
          ? {}
          : {
              handsBefore: checkpoint.handsBefore.map((hand) => ({
                counterSpins: (checkpoint.counter?.spins ?? 0) - (checkpoint.spins - hand.spins),
                rented: hand.outlay - walked.totals.outlay,
                replayed: hand.replay - walked.totals.replay,
                supported: hand.support - walked.totals.support,
                held: hand.held,
                ...(hand.counted === true ? { counted: true as const } : {}),
              })),
            }),
      }
      return { taken: [...walked.taken, { reading, afterMissedJackpot: walked.missed }], totals, missed: false }
    },
    { taken: [], totals: totalsAfter({ outlay: 0, replay: 0, support: 0 }, ordered.at(0) ?? { spins: 0 }), missed: false },
  ).taken

/**
 * Where a play stood before one of its readings: the counter as it then
 * showed — none where a jackpot had just started it over — the balls in
 * hand as last counted, or as the play was begun with them, with what each
 * bonus since paid added on, and what had been spent and drawn in all. The
 * hand is only ever what the person said and what the bonuses brought:
 * the regular games played on it are never taken off by an estimate, so a
 * drift is the person's to set right by counting.
 */
export interface Before {
  readonly counter: number
  readonly held: number | undefined
  readonly outlay: number
  readonly replay: number
  /**
   * How far the data counter stood ahead of the cabinet's own 遊タイム
   * counter, where that was said since the last jackpot: the spins of a
   * 遊タイム run out without one, which the data counter kept and the 遊
   * counter did not. None where nothing was said, the two being one.
   */
  readonly gaugeOffset: number | undefined
}

/** What a bonus a reading won paid beyond what it took to win: what it added to the hand. */
const bonusGainOf = (reading: Reading): number => (reading.jackpot.type === "bonus" ? Math.max(0, reading.jackpot.bonus.payout - reading.jackpot.bonus.spent) : 0)

/** The balls in hand after a reading, from those before it: what it counted last — inside it, folded, or at its line — else what was in hand with its bonus added; none where nothing was ever said and nothing was won. */
const heldAfter = (before: number | undefined, { reading }: Taken): number | undefined => {
  if (reading.held !== undefined) return reading.held
  const from = (reading.handsBefore ?? []).findLast((hand) => hand.counted === true)?.held ?? before
  const gain = bonusGainOf(reading)
  return gain === 0 ? from : (from ?? 0) + gain
}

/** The data counter's lead over the 遊 counter as the seat found them, where the 遊 counter was said there. */
const seatGaugeOffset = (seat: Checkpoint | undefined): number | undefined =>
  seat?.counter?.gauge === undefined ? undefined : (seat.counter.spins ?? 0) - seat.counter.gauge

/**
 * The data counter's lead over the 遊 counter after a reading: what the
 * reading said of the two, else what was said before — none past a
 * jackpot, written or found missing, where both start over.
 */
const gaugeOffsetAfter = (before: number | undefined, { reading, afterMissedJackpot }: Taken): number | undefined => {
  if (reading.jackpot.type !== "none") return undefined
  if (reading.gauge !== undefined) return reading.counterSpins - reading.gauge
  return afterMissedJackpot ? undefined : before
}

/** Where the play stood before its reading at `index` — after them all, where there is none there. */
export const standingBefore = (ordered: readonly Checkpoint[], index: number): Before => {
  const seat = ordered.at(0)
  const earlier = takenOf(ordered).slice(0, index)
  const last = earlier.at(-1)?.reading
  return {
    counter: last === undefined ? (seat?.counter?.spins ?? 0) : last.jackpot.type === "none" ? last.counterSpins : 0,
    held: earlier.reduce(heldAfter, seat?.held),
    outlay: earlier.reduce((sum, each) => sum + each.reading.rented, seat?.outlay ?? 0),
    replay: earlier.reduce((sum, each) => sum + each.reading.replayed, seat?.replay ?? 0),
    gaugeOffset: earlier.reduce(gaugeOffsetAfter, seatGaugeOffset(seat)),
  }
}

/**
 * The spins a reading's data counter stands at toward the 遊タイム, given
 * where the play stood before it: the cabinet's own 遊 counter where the
 * reading says it, else the data counter less the lead it had — the data
 * counter itself where none was said or a jackpot started both over.
 */
export const gaugeAt = (counterSpins: number, before: Before): number => counterSpins - (before.gaugeOffset ?? 0)

/** The spins the play's cabinet stands at toward the 遊タイム now: what its 遊 counter shows, said or followed from where it was said. */
export const gaugeNowOf = (ordered: readonly Checkpoint[]): number => {
  const now = standingBefore(ordered, takenOf(ordered).length)
  return gaugeAt(now.counter, now)
}

/**
 * The lines that say the play's cabinet's 遊 counter shows `gauge` now,
 * otherwise than it was followed: a reading at the data counter where it
 * stands, in the state last said, that says nothing else.
 */
export const gaugeSaid = (ordered: readonly Checkpoint[], gauge: number, at: string): Result<readonly Checkpoint[], ReadingRefusal> => {
  const now = standingBefore(ordered, takenOf(ordered).length)
  const reading: Reading = { counterSpins: now.counter, phase: ordered.at(-1)?.phase ?? "regular", rented: 0, replayed: 0, supported: 0, held: undefined, jackpot: { type: "none" }, at, gauge }
  return checkpointsForReading(ordered, reading, false)
}

/** The balls in hand at a play's end as the person told them: the last count, with what each bonus since paid; never estimated down by the regular games since. */
export const heldAsToldOf = (ordered: readonly Checkpoint[]): number | undefined => standingBefore(ordered, takenOf(ordered).length).held

/** A log made again from its first line and its readings, each added as it was when taken. */
const madeFrom = (seat: Checkpoint, taken: readonly Taken[]): Result<readonly Checkpoint[], RevisionRefusal> =>
  taken.reduce<Result<readonly Checkpoint[], RevisionRefusal>>(
    (made, each, index) => {
      if (!made.ok) return made
      const added = checkpointsForReading(made.value, each.reading, each.afterMissedJackpot)
      return added.ok ? Ok([...made.value, ...added.value]) : Err({ ...added.error, index })
    },
    Ok([seat]),
  )

/**
 * A play's log with its readings changed, made again from the seat on, so
 * every running total after the change follows from it. Refused where the
 * change leaves a counter going back.
 */
export const revised = (ordered: readonly Checkpoint[], change: (taken: readonly Taken[]) => readonly Taken[]): Result<readonly Checkpoint[], RevisionRefusal> => {
  const seat = ordered.at(0)
  return seat === undefined ? Ok(ordered) : madeFrom(seat, change(takenOf(ordered)))
}

/** The log with the reading at `index` taken as given instead: a mistyped count set right. */
export const withReadingRevised = (ordered: readonly Checkpoint[], index: number, reading: Reading): Result<readonly Checkpoint[], RevisionRefusal> =>
  revised(ordered, (taken) => taken.map((each, at) => (at === index ? { ...each, reading } : each)))

/** The log without the reading at `index`: one taken by mistake. */
export const withReadingRemoved = (ordered: readonly Checkpoint[], index: number): Result<readonly Checkpoint[], RevisionRefusal> =>
  revised(ordered, (taken) => taken.filter((_, at) => at !== index))

/** The log with a reading put in before the one at `index` — after them all, where there is none there: one that was never written down. */
export const withReadingInserted = (ordered: readonly Checkpoint[], index: number, reading: Reading): Result<readonly Checkpoint[], RevisionRefusal> =>
  revised(ordered, (taken) => [...taken.slice(0, index), { reading, afterMissedJackpot: false }, ...taken.slice(index)])

/** The data counter as it was found at the seat: the spins since its last jackpot, the day's spins and the day's jackpots. */
export interface Seat {
  readonly spins: number
  readonly total: number
  readonly jackpots: number
  /** The cabinet's own 遊タイム counter, where it was said: none where it shows what the data counter does. */
  readonly gauge?: number
}

/** The seat's counter as a log's first line has it; none read is none. */
export const seatOf = (ordered: readonly Checkpoint[]): Seat => {
  const counter = ordered.at(0)?.counter
  return { spins: counter?.spins ?? 0, total: counter?.total ?? 0, jackpots: counter?.jackpots ?? 0, ...(counter?.gauge === undefined ? {} : { gauge: counter.gauge }) }
}

/**
 * The log with the seat's counter set right, its 遊 counter as the seat
 * now says it — none, where it says none. Every reading before the
 * first jackpot counts on from the seat, so they are all made again.
 */
export const withSeatRevised = (ordered: readonly Checkpoint[], seat: Seat): Result<readonly Checkpoint[], RevisionRefusal> => {
  const first = ordered.at(0)
  if (first === undefined) return Ok(ordered)
  const { gauge: _, ...counter } = first.counter ?? {}
  return madeFrom({ ...first, counter: { ...counter, ...seat } }, takenOf(ordered))
}

/**
 * A log as another machine reads it. Each jackpot named one of the bonuses
 * of the machine the play was begun on, with what that bonus paid; another
 * machine lists its own, so every jackpot is left untold — still a
 * jackpot, where it was — to be said again reading by reading.
 */
export const withJackpotsUntold = (checkpoints: readonly Checkpoint[]): readonly Checkpoint[] =>
  checkpoints.map((checkpoint) =>
    checkpoint.event?.kind === "jackpot" && checkpoint.event.bonus !== undefined
      ? { ...checkpoint, event: { kind: "jackpot" as const, ...(checkpoint.event.approximate === true ? { approximate: true as const } : {}) } }
      : checkpoint,
  )
