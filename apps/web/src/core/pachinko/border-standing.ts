import { PACE_BY_DEFAULT } from "./inference"

/** Where a play stands against its border: above it, below it, or level with it. */
export type BorderStanding = "above" | "below" | "level"

/**
 * How far above or below its border a play stands, by what it is worth
 * an hour: from 5,000 yen up, 4,000, 3,000, 2,000, 1,750, 1,500 — the hour a
 * professional moves for — anything above nothing, down to 300 yen
 * under nothing with the border itself, down to 1,000 under, to 2,000,
 * to 3,000, and below that.
 */
export type BorderGrade = "crowned" | "shining" | "outstanding" | "excellent" | "strong" | "professional" | "modest" | "near" | "short" | "shorter" | "deep" | "deepest"

/** Where a play stands against its border, and how far. */
export interface BorderMark {
  readonly standing: BorderStanding
  readonly grade: BorderGrade
}

const FLOORS: readonly (readonly [BorderGrade, number])[] = [
  ["crowned", 5000],
  ["shining", 4000],
  ["outstanding", 3000],
  ["excellent", 2000],
  ["strong", 1750],
  ["professional", 1500],
  ["modest", 1],
  ["near", -300],
  ["short", -1000],
  ["shorter", -2000],
  ["deep", -3000],
]

/** How long a play has gone on: the regular spins measured, and the minutes from its start to its latest line written with a time. */
export interface PlayedSoFar {
  readonly spins: number
  readonly minutes: number | undefined
}

/**
 * Regular spins a play is measured over, and minutes it is played for,
 * before it may wear one of the best three marks: over fewer spins a spin performance
 * swings by more than a spin for ¥1,000, and a lucky first stretch would
 * wear it; and within the first minutes a count mistyped — 310 for 31 —
 * would make the spins at once. Ninety minutes is 300 spins at 200 an hour.
 */
const SPINS_BEFORE_OUTSTANDING = 300
const MINUTES_BEFORE_OUTSTANDING = 90

/** Every grade, the best first: what a legend of the marks lists. */
export const BORDER_GRADES: readonly BorderGrade[] = [...FLOORS.map(([grade]) => grade), "deepest"]

const gradeOf = (hourly: number): BorderGrade => FLOORS.find(([, floor]) => hourly >= floor)?.[0] ?? "deepest"

const longEnough = (played: PlayedSoFar): boolean =>
  played.spins >= SPINS_BEFORE_OUTSTANDING && played.minutes !== undefined && played.minutes >= MINUTES_BEFORE_OUTSTANDING

const HELD_BACK: ReadonlySet<BorderGrade> = new Set(["crowned", "shining", "outstanding"])

const heldBack = (grade: BorderGrade, played: PlayedSoFar): BorderGrade => (HELD_BACK.has(grade) && !longEnough(played) ? "excellent" : grade)

/**
 * Where a play stands against its border, told by what a spin is worth
 * carried over an hour at the pace every cabinet is taken to play at, in
 * whole yen — never by its spin performance set against the border, and
 * never by a formula's own pace, so that one spin's worth is one mark
 * whatever the machine. Level is an hour worth nothing to the yen. The
 * best three marks wait for 300 measured spins and 90 minutes played,
 * the one under them standing in until then; a log whose lines carry no time never
 * wears it. Nothing where what a spin is worth is not known.
 */
export const borderMarkOf = (yenPerSpin: number | undefined, played: PlayedSoFar): BorderMark | undefined => {
  if (yenPerSpin === undefined) return undefined
  const hourly = Math.round(yenPerSpin * PACE_BY_DEFAULT)
  return { standing: hourly > 0 ? "above" : hourly < 0 ? "below" : "level", grade: heldBack(gradeOf(hourly), played) }
}
