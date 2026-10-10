import type { BonusWon, Checkpoint, Phase } from "../play-log/checkpoint"
import { afterMissedJackpot, readCounter } from "../play-log/live"
import { Err, Ok, type Result } from "../result/result"

/**
 * One reading taken at the cabinet: the counter as the parlor shows it,
 * the state the spins since the reading before were played in, and what
 * has happened to the balls since — yen rented, tokens drawn from savings,
 * what the 電サポ gained or lost — with the balls in hand where they were
 * counted. A reading that says a jackpot came gives the counter as it stood
 * when it came, and the counter starts over from there.
 */
export interface Reading {
  readonly counterSpins: number
  readonly phase: Phase
  readonly rented: number
  readonly replayed: number
  readonly supported: number
  readonly held: number | undefined
  readonly jackpot: Jackpot
  readonly at: string
}

/**
 * Whether a reading is a jackpot, and which bonus it was: one of those its
 * machine lists, or untold where the machine lists none — what it paid is
 * then unknown.
 */
export type Jackpot = { readonly type: "none" } | { readonly type: "untold" } | { readonly type: "bonus"; readonly bonus: BonusWon }

const eventOf = (jackpot: Jackpot): Pick<Checkpoint, "event"> => {
  switch (jackpot.type) {
    case "none":
      return {}
    case "untold":
      return { event: { kind: "jackpot" } }
    case "bonus":
      return { event: { kind: "jackpot", bonus: jackpot.bonus } }
  }
}

/** Why a reading cannot be added as it stands: the counter shows less than it must by now, so it started over unseen. */
export type ReadingRefusal = { readonly type: "counter-went-back"; readonly expectedAtLeast: number }

const lastKnown = (ordered: readonly Checkpoint[], read: (checkpoint: Checkpoint) => number | undefined): number =>
  ordered.map(read).findLast((value): value is number => value !== undefined) ?? 0

/** Everything a reading records except where in the play it falls: the running totals as they stand with it. */
const readingFields = (ordered: readonly Checkpoint[], reading: Reading): Omit<Checkpoint, "spins"> => {
  const replay = lastKnown(ordered, (checkpoint) => checkpoint.replay) + reading.replayed
  const support = lastKnown(ordered, (checkpoint) => checkpoint.support) + reading.supported
  return {
    outlay: lastKnown(ordered, (checkpoint) => checkpoint.outlay) + reading.rented,
    at: reading.at,
    counter: { spins: reading.counterSpins },
    ...eventOf(reading.jackpot),
    phase: reading.phase,
    ...(replay === 0 ? {} : { replay }),
    ...(support === 0 ? {} : { support }),
    ...(reading.held === undefined ? {} : { held: reading.held }),
  }
}

/**
 * The checkpoints a reading adds to a log, or why it cannot be added as it
 * stands. `missedJackpot` is the person's answer to a counter that went
 * back: a jackpot came that nobody wrote down, so it is written down now,
 * approximately, before the reading.
 */
export const checkpointsForReading = (ordered: readonly Checkpoint[], reading: Reading, missedJackpot: boolean): Result<readonly Checkpoint[], ReadingRefusal> => {
  const read = readCounter(ordered, reading.counterSpins)
  if (read.type === "continues") return Ok([{ spins: read.spins, ...readingFields(ordered, reading) }])
  return missedJackpot ? Ok(afterMissedJackpot(ordered, reading.counterSpins, readingFields(ordered, reading))) : Err(read)
}
