import type { AnalysisDto, EstimateSummaryDto } from "@p-lens/contracts/pachinko"

/**
 * The figures a formula — a 算出条件 — is: everything a theoretical value is
 * worked out from, whatever produced them. A spin wins on average
 * `payoutPerRound / roundChanceOneIn` balls, and that is the whole of
 * what play conditions are weighed against.
 */
export interface Figures {
  /** The 1R トータル確率: one round won per this many regular-game spins. */
  readonly roundChanceOneIn: number
  /** The 1R 平均出玉: balls one round yields. */
  readonly payoutPerRound: number
  /** The トータル確率, where it is known: one jackpot per this many spins. */
  readonly totalChanceOneIn: number | undefined
  /** Regular-game spins in an hour, for the theoretical value of an hour; absent, there is none. */
  readonly spinsPerHour: number | undefined
}

/**
 * The figures of a formula the engine worked out: its exact 1R chance,
 * what a round yields under the basis' conditions, and its total chance.
 */
export const figuresFromAnalysis = (analysis: AnalysisDto, spinsPerHour: number | undefined): Figures => ({
  roundChanceOneIn: analysis.roundChanceOneIn,
  payoutPerRound: analysis.ballsPerRound,
  totalChanceOneIn: analysis.totalChanceOneIn,
  spinsPerHour,
})

/**
 * The figures of a formula estimated by sampling: the sampled 1R chance,
 * what a round yields under the basis' conditions, and no total chance,
 * which was not sampled. None while nothing has been won to estimate from.
 */
export const figuresFromEstimate = (summary: EstimateSummaryDto, spinsPerHour: number | undefined): Figures | undefined =>
  summary.roundChanceOneIn === null
    ? undefined
    : { roundChanceOneIn: summary.roundChanceOneIn, payoutPerRound: summary.payoutPerRound, totalChanceOneIn: undefined, spinsPerHour }
