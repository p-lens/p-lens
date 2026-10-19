/**
 * The shapes crossing the pachinko engine's boundary, as JSON. Mirrors
 * `crates/pachinko-wasm/src/dto.rs`; a change there is a change here, and the
 * fixtures under `fixtures/pachinko/made-up/` are read by the tests on both sides.
 *
 * Kept apart from the pachislot shapes: the two games share nothing but how a
 * probability is written.
 */

import type { ProbabilityDto } from "../probability.ts"

export type { ProbabilityDto }

export type NextDto = { readonly type: "regular" } | { readonly type: "mode"; readonly mode: string }

/**
 * Rounds of a jackpot through another attacker than the share's first
 * rounds: so many of them, by a prize and a count of their own, each the
 * machine's where it names none.
 */
export interface OtherRoundsDto {
  readonly rounds: number
  readonly prizeBalls?: number
  readonly count?: number
}

export interface AllotmentDto {
  readonly shareBasisPoints: number
  readonly rounds: number
  readonly next: NextDto
  /** The prize of the attacker this share's rounds open, where it is not the machine's. */
  readonly prizeBalls?: number
  /** The count of that attacker, where it is not the machine's. */
  readonly count?: number
  /** The rounds of the same jackpot that open another attacker: a V round through a one-ball attacker beside nine through the fifteen-ball one. */
  readonly otherRounds?: readonly OtherRoundsDto[]
  /**
   * How many jackpots the share's rounds are won over, where it is more
   * than one: a machine that gives a run of jackpots as one win — its
   * 3000 balls two jackpots of ten rounds, one after the other — is
   * written with the run as one share, and a parlor's counter still counts
   * each. Stated, never worked out from the rounds: a run of five may be
   * ten rounds or fifty.
   */
  readonly jackpots?: number
}

/**
 * ラッキートリガー: the jackpot that makes combo `atCombo` in a mode, counting
 * the one that entered it, moves play to `to`. "3連で LT" is `atCombo: 3`.
 */
export interface LuckyTriggerDto {
  readonly atCombo: number
  readonly to: string
}

/**
 * The version of the shape a spec is written in — its entities, a table per
 * component, its resources — which every spec says of itself in `v`. An
 * engine met with another version refuses the spec by that number rather
 * than misread it. A component added is no new version: a table an engine
 * does not know is refused by its name. Only the shape itself changing is.
 */
export const SPEC_VERSION = 1

/**
 * A machine as an ECS world: its entities — the regular game and its modes —
 * a table per component keyed by entity, and the resources the whole machine
 * shares. A table no entity has is left out; a table the engine does not
 * know is refused as `unsupported-component`. The engine queries the
 * components; a feature is a component, not a new shape.
 */
export interface SpecDto {
  readonly v: number
  readonly entities: readonly string[]
  readonly components: ComponentsDto
  readonly resources: { readonly payout: { readonly prizeBalls: number; readonly count: number } }
}

export interface ComponentsDto {
  /** The regular game: how often it hits. Exactly one entity has it. */
  readonly regularGame?: Readonly<Record<string, { readonly chance: ProbabilityDto }>>
  readonly label?: Readonly<Record<string, string>>
  /** How a jackpot won there is allotted. */
  readonly allotment?: Readonly<Record<string, readonly AllotmentDto[]>>
  /** An ST: so many spins at a raised chance. */
  readonly specialTime?: Readonly<Record<string, { readonly spins: number; readonly chance: ProbabilityDto }>>
  /** A 時短: so many spins at the regular game's chance, played fast and with tulip support. */
  readonly rapid?: Readonly<Record<string, { readonly spins: number }>>
  /** 残保留: the draws still queued when a mode's spins run out, at the regular game's chance. */
  readonly leftoverQueue?: Readonly<Record<string, { readonly draws: number }>>
  /** A RUSH as many spec sheets summarise it: a continuation rate given directly. */
  readonly rushing?: Readonly<Record<string, { readonly continuationRate: ProbabilityDto }>>
  /** Until the next jackpot, which is certain: a 確変 loop. */
  readonly untilHit?: readonly string[]
  /** Where play goes when a mode ends without a jackpot. */
  readonly onMiss?: Readonly<Record<string, NextDto>>
  readonly luckyTrigger?: Readonly<Record<string, LuckyTriggerDto>>
  /** The regular game's 遊タイム. */
  readonly reliefDrive?: Readonly<Record<string, ReliefDriveDto>>
}

/** A 遊タイム: once its `gauge` of regular-game spins fills without a jackpot, play moves to mode `to`. */
export interface ReliefDriveDto {
  readonly gauge: number
  readonly to: string
}

/** How regular play starts again after a combo: with the relief gauge already filled so far, or with the 遊タイム spent until a jackpot. */
export interface RestartDto {
  readonly restart: { readonly type: "filled"; readonly spins: number } | { readonly type: "spent" }
  readonly weight: number
  readonly spins: number
  readonly rounds: number
  readonly hits: number
  /** Balls the cycle's rounds gain, as the spec's payout gives them. */
  readonly balls: number
}

/**
 * From one point of a combo — a state, the spins filled on the way out, and
 * whether the 遊タイム's first run is still unbroken — the chance of each way
 * regular play starts again: what the long run is worked out from, given so
 * that it can be checked from outside the engine.
 */
export interface EndingDto {
  readonly state: number
  readonly filled: number
  readonly unbroken: boolean
  readonly chances: readonly { readonly restart: RestartDto["restart"]; readonly chance: number }[]
}

export type TargetDto = { readonly type: "state"; readonly index: number } | { readonly type: "end" }

export interface OutcomeDto {
  readonly probability: number
  readonly rounds: number
  readonly hits: number
  readonly next: TargetDto
  /** Balls the rounds gain, said only where they are not the machine's payout rule times the rounds. */
  readonly balls?: number
}

export interface NormalizedSpecDto {
  readonly schemaVersion: number
  readonly hitChance: number
  readonly entry: readonly OutcomeDto[]
  readonly states: readonly { readonly outcomes: readonly OutcomeDto[]; readonly fillsGauge?: number }[]
  /** The combo each state stands at in its mode, counting the jackpot that entered it. */
  readonly origins: readonly { readonly mode: string; readonly combo: number }[]
  readonly netBallsPerRound: number
  readonly reliefDrive?: { readonly gauge: number; readonly target: TargetDto }
}

export type SourceDto =
  | { readonly type: "spec"; readonly spec: SpecDto }
  | { readonly type: "normalized"; readonly normalized: NormalizedSpecDto }

export interface ConditionsDto {
  readonly roundPayout: { readonly type: "from-spec" } | { readonly type: "measured"; readonly balls: number }
}

export interface PlayDto {
  readonly spinPerformance: number
  readonly ballValue: number
}

export interface AnalyzeRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
}

export interface AnalysisDto {
  readonly engineVersion: number
  readonly schemaVersion: number
  readonly averageRounds: number
  readonly averageCombo: number
  /** Balls a round gains on average over the long run: every round's gain over every round. */
  readonly ballsPerRound: number
  readonly averagePayout: number
  /** What a ball of the spec's payout really yields: one, unless a round's payout was measured. */
  readonly payoutScale: number
  readonly totalChanceOneIn: number
  readonly roundChanceOneIn: number
  readonly modeEntry: readonly { readonly mode: string; readonly probability: number }[]
  readonly derivation: readonly {
    readonly mode: string
    readonly combo: number
    readonly averageRounds: number
    readonly averageCombo: number
    /** Balls the state's rounds gain from there on, as the spec's payout gives them. */
    readonly averageBalls: number
  }[]
  readonly normalized: NormalizedSpecDto
  /** What the 遊タイム adds, counted from a jackpot. */
  readonly reliefDrive?: {
    readonly gauge: number
    readonly reachProbability: number
    readonly roundsAfter: number
    readonly comboAfter: number
    /** Balls the mode it leads to gains, as the spec's payout gives them. */
    readonly ballsAfter: number
    /** Each way regular play starts again over the long run: how often, and what a cycle from it yields. */
    readonly restarts: readonly RestartDto[]
    /** From every point of a combo, the chance of each way of starting again. */
    readonly endings: readonly EndingDto[]
  }
}

export interface PlanDto {
  readonly sessions: number
  readonly spinsPerSession: number
}

/** A simulation in progress. Opaque: handed back to the engine as received. */
export type ProgressDto = { readonly rng: readonly [string, string, string, string] } & Readonly<Record<string, unknown>>

export interface SimulateRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly play: PlayDto
  readonly plan: PlanDto
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

export interface SummaryDto {
  readonly sessions: number
  readonly planned: number
  readonly finished: boolean
  readonly meanYen: number | null
  readonly standardDeviationYen: number | null
  readonly winRate: number | null
  readonly minYen: number | null
  readonly maxYen: number | null
  readonly roundsPerFirstHit: number | null
  readonly averageCombo: number | null
  readonly truncatedCombos: number
  readonly histogram: readonly { readonly fromYen: number; readonly toYen: number; readonly count: number }[]
}

export interface SimulateResponse {
  readonly progress: ProgressDto
  readonly summary: SummaryDto
}

/**
 * A formula's figures estimated by sampling so many cycles — regular play to
 * its first jackpot and the combo after — from a seed.
 */
export interface EstimateRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly cycles: number
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

export interface EstimateSummaryDto {
  readonly cycles: number
  readonly planned: number
  readonly finished: boolean
  readonly roundChanceOneIn: number | null
  /** The 95% margin of `roundChanceOneIn`. */
  readonly roundChanceMargin: number | null
  readonly roundsPerFirstHit: number | null
  /** Balls a round pays under the conditions: given by them, not sampled. */
  readonly payoutPerRound: number
  readonly truncatedCombos: number
}

export interface EstimateResponse {
  readonly progress: ProgressDto
  readonly summary: EstimateSummaryDto
}

/** 遊タイム狙い sampled: sittings from initial spins, each played until a first jackpot — or the 遊タイム — and its combo are over. */
export interface HyenaHuntRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly play: PlayDto
  /** Regular-game spins since the cabinet's last jackpot, played by whoever sat there before. */
  readonly initialSpins: number
  readonly trials: number
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

export interface HyenaHuntSummaryDto {
  readonly trials: number
  readonly planned: number
  readonly finished: boolean
  readonly meanYen: number | null
  /** The 95% margin of `meanYen`. */
  readonly marginYen: number | null
  readonly standardDeviationYen: number | null
  readonly winRate: number | null
  readonly minYen: number | null
  readonly maxYen: number | null
  readonly reliefDriveRate: number | null
  readonly meanSpins: number | null
  readonly truncatedCombos: number
  readonly histogram: readonly { readonly fromYen: number; readonly toYen: number; readonly count: number }[]
}

export interface HyenaHuntResponse {
  readonly progress: ProgressDto
  readonly summary: HyenaHuntSummaryDto
}

/** 遊タイム狙い solved exactly from each of several initial spins. */
export interface HyenaHuntTableRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly play: PlayDto
  readonly initialSpins: readonly number[]
}

export interface HyenaHuntRowDto {
  readonly initialSpins: number
  readonly yen: number
  readonly spins: number
  readonly rounds: number
  readonly reliefDriveProbability: number
}

/** A play told of afterwards, weighed for the spin performance its cabinet had: the machine played out for its hours, so many times, from a seed. */
export interface InferenceRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly told: ToldDto
  readonly belief: BeliefDto
  /** Regular spins the cabinet plays in an hour. */
  readonly spinsPerHour: number
  /** Balls ¥1,000 rents. */
  readonly rentedPerThousand: number
  /** Yen a ball exchanges for. */
  readonly ballValue: number
  /** Balls a regular spin wins on average, by the play's formula. */
  readonly ballsPerSpin: number
  readonly trials: number
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

export interface InferenceSummaryDto {
  readonly trials: number
  readonly planned: number
  readonly finished: boolean
  /** The reading so far; none until a trial has come near what was told. */
  readonly reading: ReadingDto | null
  /** The fewest trials that went as far as the play any one way — in its cash, in what came back, in what the two came to: out of `trials`, how often a play as far out as this one came. */
  readonly rarest: number
  /** Which way that was. */
  readonly rarestWay: WayDto
}

/** A way a play can be out of the ordinary: in its cash, in what came back or in what the two came to, by as much as told or more, or by as little or less. */
export type WayDto = "outlay-at-least" | "outlay-at-most" | "takings-at-least" | "takings-at-most" | "result-at-least" | "result-at-most"

export interface InferenceResponse {
  readonly progress: ProgressDto
  readonly summary: InferenceSummaryDto
}

/** What a person tells of a play afterwards: its hours, the cash it took and what came back, in yen, and the jackpots where they looked. */
export interface ToldDto {
  readonly hours: number
  readonly outlay: number
  readonly takings: number
  readonly jackpots?: number
}

/** What is believed of the spin performance before the play is told of: about `mean`, give or take `deviation`, in spins per ¥1,000. */
export interface BeliefDto {
  readonly mean: number
  readonly deviation: number
}

/** What the trials that came near a told play say: the spin performance to go by — the middle of what they allow — with the quartiles either side of it, the regular spins it had, and how many trials of equal weight the reading rests on, which is the caller's to judge. */
export interface ReadingDto {
  readonly lower: number
  readonly middle: number
  readonly upper: number
  readonly spins: number
  /** The theoretical value half the trials' weight lies below, in yen: each trial's own — its spins at its spin performance — and the middle of those. */
  readonly value: number
  readonly effectiveTrials: number
}

export type LocationDto = { readonly type: "regular" } | { readonly type: "mode"; readonly mode: string }

export type EngineErrorDto =
  | { readonly type: "malformed-request"; readonly detail: string }
  | { readonly type: "invalid-value"; readonly field: string }
  | { readonly type: "unsupported-component"; readonly field: string }
  | { readonly type: "unsupported-spec-version"; readonly version: number; readonly known: number }
  | { readonly type: "unsupported-schema-version"; readonly version: number; readonly known: number }
  | { readonly type: "invalid-probability"; readonly at: LocationDto; readonly problem: "not-finite" | "out-of-range" | "zero" }
  | { readonly type: "invalid-distribution"; readonly at: LocationDto; readonly sumBasisPoints: number }
  | { readonly type: "duplicate-mode"; readonly mode: string }
  | { readonly type: "no-regular-game" }
  | { readonly type: "several-regular-games" }
  | { readonly type: "missing-component"; readonly entity: string; readonly component: string }
  | { readonly type: "missing-kind"; readonly entity: string }
  | { readonly type: "conflicting-components"; readonly entity: string; readonly first: string; readonly second: string }
  | { readonly type: "stray-component"; readonly entity: string; readonly component: string }
  | { readonly type: "unknown-mode"; readonly at: LocationDto; readonly mode: string }
  | { readonly type: "unreachable-state"; readonly mode: string }
  | { readonly type: "non-absorbing-model"; readonly mode: string }
  | {
      readonly type: "unsupported-spec"
      readonly reason: { readonly type: "too-many-states"; readonly states: number; readonly limit: number } | { readonly type: "lucky-trigger-to-itself" } | { readonly type: "lucky-trigger-on-entry" }
    }
  | { readonly type: "solve-failed"; readonly reason: "singular" | "dangling-target" }

/** The envelope every engine answer travels in. */
export type Envelope<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: EngineErrorDto }

export type * from "./catalog.ts"
export { bonusShapesOf, jackpotsOf, roundsOf, type BonusRounds, type BonusShape } from "./bonuses.ts"
