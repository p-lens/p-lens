import type { HyenaHuntRowDto, PlayDto } from "@p-lens/contracts/pachinko"

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
