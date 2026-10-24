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
  /** Where the balls in hand were known inside a reading made of several folded together, oldest first; none in a reading taken as it is. */
  readonly handsBefore?: readonly ReadingHand[]
  /** The cabinet's own 遊タイム counter as it showed with the data counter, where it was said: from here to the next jackpot, the spins toward the 遊タイム are the data counter's less the difference between them. */
  readonly gauge?: number
  /** Whether the reading says the cabinet turned to 時短 there: from 確変, a line with nothing else on it, or from regular games, the 遊タイム reached; never a jackpot's. */
  readonly rapidBegan?: true
}

/**
 * The balls in hand at a point inside a reading folded from several: the
 * counter there, what had been rented, drawn and drifted since the reading
 * before by then, and the balls in hand.
 */
export interface ReadingHand {
  readonly counterSpins: number
  readonly rented: number
  readonly replayed: number
  readonly supported: number
  readonly held: number
  /** Whether the balls were counted there, rather than known by more being bought. */
  readonly counted?: true
}

/**
 * Whether a reading is a jackpot, and which bonus it was: one of those its
 * machine lists, or untold where the machine lists none — what it paid is
 * then unknown.
 */
export type Jackpot = { readonly type: "none" } | { readonly type: "untold" } | { readonly type: "bonus"; readonly bonus: BonusWon }

const eventOf = (jackpot: Jackpot, rapidBegan: boolean): Pick<Checkpoint, "event"> => {
  switch (jackpot.type) {
    case "none":
      return rapidBegan ? { event: { kind: "rapid-began" } } : {}
    case "untold":
      return { event: { kind: "jackpot" } }
    case "bonus":
      return { event: { kind: "jackpot", bonus: jackpot.bonus } }
  }
}

/** The states the 電サポ runs in after a jackpot: 確変, or 時短. */
export type SupportPhase = Exclude<Phase, "regular">

/**
 * The state the cabinet's 電サポ is in, where it is on one: 確変 where a
 * jackpot is the last thing the play said, 時短 where the last is its
 * turning to 時短. A run of jackpots keeps it there, each starting it in
 * 確変 again, and the reading that says it came back to regular games — a
 * line in 確変 or 時短 with nothing on it — ends it; nothing else is
 * written while it lasts. None in regular games.
 */
export const supportPhaseOf = (ordered: readonly Checkpoint[]): SupportPhase | undefined => {
  const kind = ordered.at(-1)?.event?.kind
  return kind === "jackpot" ? "special" : kind === "rapid-began" ? "rapid" : undefined
}

/**
 * Whether the 時短 the cabinet is in is its 遊タイム, with no jackpot since:
 * the turn to it was made straight from regular games. Ended without one,
 * the cabinet's 遊 counter starts over where the data counter does not.
 */
export const inReliefDrive = (ordered: readonly Checkpoint[]): boolean => {
  const last = ordered.at(-1)
  return last?.event?.kind === "rapid-began" && (last.phase ?? "regular") === "regular"
}

/** Why a reading cannot be added as it stands: the counter shows less than it must by now, so it started over unseen. */
export type ReadingRefusal = { readonly type: "counter-went-back"; readonly expectedAtLeast: number }

const lastKnown = (ordered: readonly Checkpoint[], read: (checkpoint: Checkpoint) => number | undefined): number =>
  ordered.map(read).findLast((value): value is number => value !== undefined) ?? 0

/** Everything a reading records except where in the play it falls: the running totals as they stand with it — the 電サポ's too where it has come back to none, a line that says none of a total being read as leaving it as it was. */
const readingFields = (ordered: readonly Checkpoint[], reading: Reading): Omit<Checkpoint, "spins"> => {
  const replay = lastKnown(ordered, (checkpoint) => checkpoint.replay) + reading.replayed
  const supportBefore = lastKnown(ordered, (checkpoint) => checkpoint.support)
  const support = supportBefore + reading.supported
  return {
    outlay: lastKnown(ordered, (checkpoint) => checkpoint.outlay) + reading.rented,
    at: reading.at,
    counter: reading.gauge === undefined ? { spins: reading.counterSpins } : { spins: reading.counterSpins, gauge: reading.gauge },
    ...eventOf(reading.jackpot, reading.rapidBegan === true),
    phase: reading.phase,
    ...(replay === 0 ? {} : { replay }),
    ...(support === 0 && supportBefore === 0 ? {} : { support }),
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
  if (read.type === "continues") return Ok(withHands(ordered, reading, [{ spins: read.spins, ...readingFields(ordered, reading) }]))
  return missedJackpot ? Ok(withHands(ordered, reading, afterMissedJackpot(ordered, reading.counterSpins, readingFields(ordered, reading)))) : Err(read)
}

/**
 * The lines a reading adds, the last carrying the hands known inside the
 * reading as a line of their own would have said them: so many spins
 * before it by the counter, at the running totals there. A hand the
 * counter no longer places between the line before and this one — the
 * reading's counter set right since — is let go of.
 */
const withHands = (ordered: readonly Checkpoint[], reading: Reading, made: readonly Checkpoint[]): readonly Checkpoint[] => {
  const line = made.at(-1)
  if (line === undefined || reading.handsBefore === undefined) return made
  const since = ordered.at(-1)?.spins ?? 0
  const base = { outlay: lastKnown(ordered, (each) => each.outlay), replay: lastKnown(ordered, (each) => each.replay), support: lastKnown(ordered, (each) => each.support) }
  const hands = reading.handsBefore
    .map((hand) => ({
      spins: line.spins - (reading.counterSpins - hand.counterSpins),
      outlay: base.outlay + hand.rented,
      replay: base.replay + hand.replayed,
      support: base.support + hand.supported,
      held: hand.held,
      ...(hand.counted === true ? { counted: true as const } : {}),
    }))
    .filter((hand) => hand.spins >= since && hand.spins <= line.spins)
  return hands.length === 0 ? made : [...made.slice(0, -1), { ...line, handsBefore: hands }]
}

/** Why the 電サポ cannot be turned to 時短: it is not in 確変 — the play is in regular games, or in 時短 already. */
export interface RapidRefusal {
  readonly type: "not-in-special"
}

/**
 * The line that turns the 電サポ from 確変 to 時短, at a moment: on the
 * jackpot's own spins, the counter not read. Refused unless the 電サポ is
 * in 確変, so that however often it is asked for, a run turns to 時短 once.
 */
export const checkpointsForRapid = (ordered: readonly Checkpoint[], at: string): Result<readonly Checkpoint[], RapidRefusal> => {
  if (supportPhaseOf(ordered) !== "special") return Err({ type: "not-in-special" })
  const made = checkpointsForReading(ordered, { counterSpins: 0, phase: "special", rented: 0, replayed: 0, supported: 0, held: undefined, jackpot: { type: "none" }, at, rapidBegan: true }, false)
  return made.ok ? made : Err({ type: "not-in-special" })
}
