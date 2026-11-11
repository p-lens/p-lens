import type { HyenaHuntRowDto, PlayDto } from "@p-lens/contracts/pachinko"

import type { Figures } from "./figures"
import { ballsPerSpin } from "./theoretical-value"

/**
 * A 遊タイム狙い apart from the cabinet's spin rate: what its rounds are worth
 * in yen, and the regular spins it takes on average. The engine prices a
 * hunt as its rounds' worth less its spins' cost, and only the cost turns
 * on the spin rate — so one answer of the engine's, at any rate, says what
 * the hunt comes to at every other.
 */
export interface Hunt {
  readonly gain: number
  readonly spins: number
}

const costAt = (spins: number, spinPerformance: number): number => (spins * 1000) / spinPerformance

/** The hunt an engine's row is of, the spin rate it was asked at taken back out. */
export const huntOf = (row: HyenaHuntRowDto, play: PlayDto): Hunt => ({ gain: row.yen + costAt(row.spins, play.spinPerformance), spins: row.spins })

/** What a hunt comes to, in yen, at a spin rate. */
export const huntYenAt = (hunt: Hunt, spinPerformance: number): number => hunt.gain - costAt(hunt.spins, spinPerformance)

/** The spin rate a hunt breaks even at: its ボーダー. None for a hunt that wins nothing, which no rate repays. */
export const huntBorderOf = (hunt: Hunt): number | undefined => (hunt.gain > 0 ? costAt(hunt.spins, hunt.gain) : undefined)

/** A point of a hunt's curve: a spin rate and the yen it comes to there. */
export interface RatePoint {
  readonly spinPerformance: number
  readonly yen: number
}

/** A hunt's yen at evenly spaced spin rates from one to another, both ends included. */
export const huntCurve = (hunt: Hunt, from: number, to: number, points: number): readonly RatePoint[] =>
  Array.from({ length: points }, (_, index) => from + ((to - from) * index) / (points - 1)).map((spinPerformance) => ({ spinPerformance, yen: huntYenAt(hunt, spinPerformance) }))

/** How far under the own-ball border a hunt's spin rate is first assumed: a twentieth, a parlor a little harsher than most. */
const HARSHER = 0.95

/**
 * The spin rate a 遊タイム狙い is first reckoned at, to a tenth, before any
 * is typed: a little under the formula's own-ball border, the balls ¥1,000
 * rents over the balls a spin wins. Parlors sell cabinets near that border
 * on the whole, harsher ones a little under; a border in balls alone is
 * the same at any exchange rate, and a share of it the same at any price
 * of a ball. A row that gains even there gains with some room to spare.
 */
export const assumedHuntPerformance = (figures: Figures, rentedPerThousand: number): number => Math.round((rentedPerThousand / ballsPerSpin(figures)) * HARSHER * 10) / 10

/** The first row of a 遊タイム狙い table that comes to more than nothing; none where no row does. */
export const firstGainingRow = (rows: readonly HyenaHuntRowDto[]): HyenaHuntRowDto | undefined => rows.find((row) => row.yen > 0)
