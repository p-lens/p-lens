/**
 * ハマり台の投資額 across the pachinko engine's boundary. Mirrors
 * `crates/pachinko-wasm/src/sunk.rs`, kept in a file of its own as the
 * feature is, so that it is taken out whole.
 */

import type { ConditionsDto, ProgressDto, SourceDto } from "./engine.ts"

/** What a cabinet's data counter shows for the day: its regular spins, its jackpots, each of a combo counted, and where it was read for them, the spins since the last. */
export interface CounterDto {
  readonly spins: number
  readonly jackpots: number
  readonly sinceLast?: number
}

/** A counter's day played out until so many days match it, or so many are played. */
export interface SunkRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly counter: CounterDto
  /** Spins for ¥1,000. */
  readonly spinPerformance: number
  /** Balls ¥1,000 rents. */
  readonly rentedPerThousand: number
  readonly trials: number
  /** Days matching the counter after which no more are played. */
  readonly enough: number
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

/** The cash the matching days took, in yen: at a tenth, a quarter, half, three quarters and nine tenths of them, and on average. */
export interface OutlayDto {
  readonly low: number
  readonly lower: number
  readonly middle: number
  readonly upper: number
  readonly high: number
  readonly mean: number
}

/**
 * How a counter was played out: one day of no jackpot on a machine with no
 * 遊タイム (`dry`), days with the last jackpot where the counter says
 * (`pinned`), or days searched for the counter (`searched`). Only searched
 * days say, by how many matched, how seldom such a day comes.
 */
export type SunkWayDto = "dry" | "pinned" | "searched"

export interface SunkSummaryDto {
  readonly trials: number
  readonly planned: number
  readonly matched: number
  readonly finished: boolean
  readonly way: SunkWayDto
  /** How seldom a cabinet goes the counter's spins since its last jackpot without one, where that is known exactly: once in so many times. */
  readonly dryOneIn?: number
  /** None until a day has matched, but for a dry day, known from the start. */
  readonly outlay?: OutlayDto
}

export interface SunkResponse {
  readonly progress: ProgressDto
  readonly summary: SunkSummaryDto
}
