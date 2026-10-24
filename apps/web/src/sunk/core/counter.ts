import { tidyTyped } from "../../core/text/tidy"
import { Err, Ok, type Result } from "../../core/result/result"

/** What a cabinet's data counter shows for the day, as read off it. */
export interface Counter {
  /** Regular spins for the day. */
  readonly spins: number
  /** Jackpots for the day, each of a combo counted. */
  readonly jackpots: number
  /** Regular spins since the last jackpot, where it was read for them: for a day of no jackpot, the day's spins. */
  readonly sinceLast: number | undefined
}

/** A counter to play out, and the spin performance its spins are bought at. */
export interface Asked {
  readonly counter: Counter
  /** Spins for ¥1,000. */
  readonly spinPerformance: number
}

/** A counter as it is typed: each figure as text, the spins since the last jackpot left empty where it was not read. */
export interface Typed {
  readonly spins: string
  readonly jackpots: string
  readonly sinceLast: string
  readonly spinPerformance: string
}

/** Which of the typed figures cannot be played out: none, or no whole number in range, more spins since the last jackpot than in the day, or, for a day of no jackpot, other spins since it than the day's. */
export type Problem =
  | { readonly type: "spins" }
  | { readonly type: "jackpots" }
  | { readonly type: "since-last" }
  | { readonly type: "since-past-spins" }
  | { readonly type: "since-not-spins" }
  | { readonly type: "spin-performance" }

/** The most spins a counter shows for a day: more than a cabinet plays from opening to closing. */
const MOST_SPINS = 30_000

/** The most jackpots a counter shows for a day. */
const MOST_JACKPOTS = 300

/** The highest spin performance a cabinet is played at, in spins for ¥1,000. */
const MOST_SPIN_PERFORMANCE = 100

const plainOf = (text: string): string => tidyTyped(text).replaceAll(",", "")

const wholeOf = (text: string, least: number, most: number): number | undefined => {
  const plain = plainOf(text)
  const value = Number(plain)
  return /^\d+$/.test(plain) && value >= least && value <= most ? value : undefined
}

const spinPerformanceOf = (text: string): number | undefined => {
  const plain = plainOf(text)
  const value = Number(plain)
  return /^\d+(\.\d+)?$/.test(plain) && value > 0 && value <= MOST_SPIN_PERFORMANCE ? value : undefined
}

/**
 * The spins since the last jackpot as typed, or none where they were left
 * empty; what they are not, otherwise. A day of no jackpot has them
 * already, as its spins: left empty or typed as nothing, 0 beside its 0
 * jackpots, they are those, and typed otherwise, they must be.
 */
const sinceLastOf = (typed: Typed, spins: number, jackpots: number): Result<number | undefined, Problem> => {
  if (plainOf(typed.sinceLast) === "") return Ok(jackpots === 0 ? spins : undefined)
  const since = wholeOf(typed.sinceLast, 0, MOST_SPINS)
  if (since === undefined) return Err({ type: "since-last" })
  if (since > spins) return Err({ type: "since-past-spins" })
  if (jackpots > 0) return Ok(since)
  return since === 0 || since === spins ? Ok(spins) : Err({ type: "since-not-spins" })
}

/** A counter as typed, to play out; the first figure that cannot be, otherwise. */
export const askedOf = (typed: Typed): Result<Asked, Problem> => {
  const spins = wholeOf(typed.spins, 1, MOST_SPINS)
  if (spins === undefined) return Err({ type: "spins" })
  const jackpots = wholeOf(typed.jackpots, 0, MOST_JACKPOTS)
  if (jackpots === undefined) return Err({ type: "jackpots" })
  const sinceLast = sinceLastOf(typed, spins, jackpots)
  if (!sinceLast.ok) return sinceLast
  const spinPerformance = spinPerformanceOf(typed.spinPerformance)
  if (spinPerformance === undefined) return Err({ type: "spin-performance" })
  return Ok({ counter: { spins, jackpots, sinceLast: sinceLast.value }, spinPerformance })
}

/** What a counter is played out from, as text: the same counter at the same spin performance by the same formula is played out the same, and no run can be asked again for another answer. */
export const keyOf = (formulaId: string, asked: Asked): string =>
  [formulaId, asked.counter.spins, asked.counter.jackpots, asked.counter.sinceLast ?? "", asked.spinPerformance].join("|")
