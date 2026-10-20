import { PACE_BY_DEFAULT } from "./inference"

/** Where a play stands against its border: above it, below it, or level with it. */
export type BorderStanding = "above" | "below" | "level"

/**
 * How far above or below its border a play stands, by what it is worth
 * an hour: from 4,500 yen up, 3,500, 2,500, 1,500 — the hour a
 * professional moves for — anything above nothing, down to 300 yen
 * under nothing with the border itself, and below that.
 */
export type BorderGrade = "outstanding" | "excellent" | "strong" | "professional" | "modest" | "near" | "short"

/** Where a play stands against its border, and how far. */
export interface BorderMark {
  readonly standing: BorderStanding
  readonly grade: BorderGrade
}

const FLOORS: readonly (readonly [BorderGrade, number])[] = [
  ["outstanding", 4500],
  ["excellent", 3500],
  ["strong", 2500],
  ["professional", 1500],
  ["modest", 1],
  ["near", -300],
]

const gradeOf = (hourly: number): BorderGrade => FLOORS.find(([, floor]) => hourly >= floor)?.[0] ?? "short"

/**
 * Where a play stands against its border, told by what a spin is worth
 * carried over an hour at the pace every cabinet is taken to play at, in
 * whole yen — never by its spin performance set against the border, and
 * never by a formula's own pace, so that one spin's worth is one mark
 * whatever the machine. Level is an hour worth nothing to the yen.
 * Nothing where what a spin is worth is not known.
 */
export const borderMarkOf = (yenPerSpin: number | undefined): BorderMark | undefined => {
  if (yenPerSpin === undefined) return undefined
  const hourly = Math.round(yenPerSpin * PACE_BY_DEFAULT)
  return { standing: hourly > 0 ? "above" : hourly < 0 ? "below" : "level", grade: gradeOf(hourly) }
}
