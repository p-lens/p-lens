/**
 * The shapes crossing the pachislot engine's boundary, as JSON. Mirrors
 * `crates/pachislot-wasm/src/dto.rs`; a change there is a change here, and the
 * fixtures under `fixtures/pachislot/made-up/` are read by the tests on both sides.
 *
 * Kept apart from the pachinko shapes: the two games share nothing but how a
 * probability is written.
 */

import type { ProbabilityDto } from "../probability.ts"

export type { ProbabilityDto }

/** One setting's value. Settings are `1` to `6`; a machine lists the ones it has. */
export interface BySettingLevelDto<T> {
  readonly settingLevel: number
  readonly value: T
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
 * A pachislot machine as an ECS world: its entities — the bonuses and small
 * wins a regular game can come up with — a table per component keyed by
 * entity, and the resources the whole machine shares. A table no entity has
 * is left out; a table the engine does not know is refused as
 * `unsupported-component`. A feature is a component, not a new shape.
 */
export interface SpecDto {
  readonly v: number
  readonly entities: readonly string[]
  readonly components: ComponentsDto
  readonly resources: {
    /** The settings the machine has: `1` to `6`, or some of them. */
    readonly settingLevels: readonly number[]
    /** Medals a regular game takes. */
    readonly bet: number
    /** ベース, for a machine of an AT: regular games fifty medals last. */
    readonly base?: number
    /** For ceilings counted on the screen: the screen's games a regular game comes to on average, one or more. */
    readonly lcdRate?: number
    /** 有利区間の上限: medals a 有利区間 may gain from its lowest point before it ends. */
    readonly cap?: number
  }
}

/** A share of an AT's medals won at another 純増: the medals a game gains there, and the share in hundredths of a percent. */
export interface OtherNetDto {
  readonly net: number
  readonly shareBasisPoints: number
}

export interface ComponentsDto {
  readonly label?: Readonly<Record<string, string>>
  /** How often a regular game comes up with it, under each setting. */
  readonly chance?: Readonly<Record<string, readonly BySettingLevelDto<ProbabilityDto>[]>>
  /** Medals a small win pays, or a bonus gains over its own games; a bonus needs none when the rate is measured. */
  readonly payout?: Readonly<Record<string, number>>
  /** A bonus: BIG, REG. Its chance is its own, or the sum of its parts'. */
  readonly bonus?: readonly string[]
  /** A replay: the next game costs nothing. */
  readonly replay?: readonly string[]
  /** One way a bonus is won — 単独, チェリー重複 — counted apart by a player who tells them apart. */
  readonly partOf?: Readonly<Record<string, string>>
  /** An AT: won from regular games, gaining its payout over games of its own. A machine of an AT is its AT, its CZ if one brings it, and its ベース. */
  readonly at?: readonly string[]
  /** A CZ: a trigger from regular games that wins the AT at a setting's success rate. */
  readonly cz?: readonly string[]
  /** 初当たり: how often an AT — or the CZ that brings it — comes up, ceilings included, as analysis sheets publish it, under each setting. */
  readonly firstHit?: Readonly<Record<string, readonly BySettingLevelDto<ProbabilityDto>[]>>
  /** A CZ's chance of winning the AT, in hundredths of a percent, under each setting. */
  readonly success?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** 天井: on the trigger — a CZ, or an AT without one — the regular game since the last one on which it comes at the latest; on an AT a CZ brings, the AT間天井 in regular games since the last AT. */
  readonly ceiling?: Readonly<Record<string, number>>
  /** The trigger's ceiling after the settings are changed, until the first AT. */
  readonly resetCeiling?: Readonly<Record<string, number>>
  /** スルー天井: the CZs missed since the last AT after which the next one wins it. */
  readonly misses?: Readonly<Record<string, number>>
  /** An AT paid in sets: its first set's medals, and each further set's. Given with its `continuationRate`, in place of a `payout`. */
  readonly sets?: Readonly<Record<string, { readonly first: number; readonly set: number }>>
  /** 継続率: how often an AT in sets carries on to one more, in hundredths of a percent, under each setting. */
  readonly continuationRate?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** An AT's medals as a table under each setting — so many medals, so often in hundredths of a percent — in place of a `payout`. */
  readonly payoutTable?: Readonly<Record<string, readonly BySettingLevelDto<readonly PayoutRowDto[]>[]>>
  /** 純増: medals a game of an AT gains. It says the games an AT of so many medals takes, so with it an AT's gain and the machine's 機械割 each follow from the other. */
  readonly netPerGame?: Readonly<Record<string, number>>
  /** 上位AT, or a bonus inside the AT: shares of an AT's medals won at another 純増 than its `netPerGame`, which the rest are won at. */
  readonly otherNet?: Readonly<Record<string, readonly OtherNetDto[]>>
  /** 機械割 as published, in hundredths of a percent under each setting: what an AT gains is what it and the `netPerGame` imply, in place of a `payout`. */
  readonly rate?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** 引き戻し: regular games after an AT short of the cap for which its 有利区間 carries on. Needs a `cap`. */
  readonly window?: Readonly<Record<string, number>>
  /** ATs after which, on reaching the cap, play starts again as after a setting change. Needs a `cap`. */
  readonly resetOnCap?: readonly string[]
  /** A mode: a hidden state between ATs with a ceiling of its own — 天国, 通常A — inferred, never seen. */
  readonly mode?: readonly string[]
  /** 振り分け: how often play enters a mode after an AT, in hundredths of a percent, under each setting. */
  readonly allotment?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** How often play enters a mode after a setting change, where that differs; every mode has one, or none does. */
  readonly resetAllotment?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
}

export interface PayoutRowDto {
  readonly medals: number
  readonly share: number
}

export type EventKindDto =
  | { readonly type: "bonus"; readonly payout?: number }
  | { readonly type: "role"; readonly payout: number }
  | { readonly type: "replay" }

export interface EventDto {
  readonly id: string
  /** The bonus a part belongs to. */
  readonly group?: string
  readonly kind: EventKindDto
  readonly chance: number
}

export interface TableDto {
  readonly settingLevel: number
  readonly events: readonly EventDto[]
  /** An AT machine's setting; its events are then none. */
  readonly at?: AtTableDto
}

/**
 * An AT machine's setting: the trigger's chance a regular game below its
 * ceilings, its chance of winning the AT (one for an AT won directly), and
 * how play is allotted between the modes in the order of its rules, after an
 * AT and after a setting change; each sums to one.
 */
export interface AtTableDto {
  readonly chance: number
  readonly success: number
  readonly allotments: { readonly afterAt: readonly number[]; readonly afterReset: readonly number[] }
  readonly payout: PayoutLawDto
}

/** What an AT gains under a setting: a fixed figure, sets carried on at a 継続率, or a table of medals and their chances. */
export type PayoutLawDto =
  | { readonly type: "fixed"; readonly medals: number }
  | { readonly type: "sets"; readonly first: number; readonly set: number; readonly continuationRate: number }
  | { readonly type: "table"; readonly rows: readonly { readonly medals: number; readonly probability: number }[] }

export interface NormalizedSpecDto {
  readonly schemaVersion: number
  readonly bet: number
  readonly tables: readonly TableDto[]
  /** An AT machine's regular games; each table then holds its setting's `at`. */
  readonly atRules?: AtRulesDto
}

/**
 * An AT machine's regular games: its ベース, its AT, the CZ that brings it
 * if one does, its modes with the trigger's ceiling in regular games — a
 * machine without modes has one, and a second for the shorter ceiling of a
 * setting change — its AT間天井, its スルー天井, its 純増 where the 機械割
 * is to follow from what its AT gains, and its 有利区間: the cap,
 * the games it carries on after an AT short of it, and whether play starts
 * again as after a setting change once an AT reaches it.
 */
export interface AtRulesDto {
  readonly base: number
  readonly at: string
  readonly trigger?: string
  readonly modes: readonly { readonly id: string; readonly ceiling?: number }[]
  readonly atCeiling?: number
  readonly misses?: number
  readonly netPerGame?: number
  readonly cap?: number
  readonly window?: number
  readonly resetOnCap?: boolean
}

export type SourceDto =
  | { readonly type: "spec"; readonly spec: SpecDto }
  | { readonly type: "normalized"; readonly normalized: NormalizedSpecDto }

/** How each setting's payout rate is come to: from the spec, or as measured, in hundredths of a percent. */
export type PayoutBasisDto =
  | { readonly type: "from-spec" }
  | { readonly type: "measured"; readonly bySettingLevel: readonly BySettingLevelDto<number>[] }

export interface ConditionsDto {
  readonly payoutRate: PayoutBasisDto
}

/**
 * The player's terms: yen a medal is exchanged for, yen renting one costs, the
 * share of the medals played that was rented for cash (`0..=1`), the share
 * drawn from savings and the medals a replay takes off them for each it pays
 * out (none and one where left out), and games an hour.
 */
export interface PlayDto {
  readonly medalValue: number
  readonly rentalPrice: number
  readonly cashShare: number
  readonly replayShare?: number
  readonly replayRate?: number
  readonly gamesPerHour?: number
}

export interface AnalyzeRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
}

export interface BonusFigureDto {
  readonly id: string
  readonly chance: number
}

export interface ContributionDto {
  /** Absent for the games that pay nothing. */
  readonly id?: string
  readonly chance: number
  readonly medalsPerGame: number
}

export interface SettingLevelFiguresDto {
  readonly settingLevel: number
  readonly netPerGame: number
  /** 機械割 as a ratio: `1.055` is 105.5%. */
  readonly payoutRate: number
  readonly bonuses: readonly BonusFigureDto[]
  readonly combined: number
  readonly derivation: readonly ContributionDto[]
  /** On an AT machine: the medals an AT gains on average, cap and carried 有利区間 included, and the share that reach the cap. */
  readonly at?: { readonly gain: number; readonly completion: number }
}

export interface AnalysisDto {
  readonly engineVersion: number
  readonly schemaVersion: number
  readonly normalized: NormalizedSpecDto
  readonly settingLevels: readonly SettingLevelFiguresDto[]
}

export interface CountDto {
  readonly id: string
  readonly count: number
}

/** A stretch of regular games seen the same way, and what was counted in it. */
export interface SegmentDto {
  readonly games: number
  readonly counts: readonly CountDto[]
}

/**
 * What an AT machine's play went through: where it stood when first seen —
 * regular games since the last trigger and since the last AT, triggers missed
 * since that AT, and whether the settings had been changed with no AT since —
 * then each leg of regular games and how its last game ended.
 */
export interface PathDto {
  readonly start: {
    readonly sinceTrigger: number
    readonly sinceAt: number
    readonly misses: number
    readonly afterReset: boolean
    /** What the 有利区間 held at the end of the last AT, where it carries on into the games since. */
    readonly held?: number
  }
  readonly legs: readonly LegDto[]
}

export interface LegDto {
  readonly games: number
  readonly end: "going" | "missed" | "won-at"
  /** What was seen of the AT a leg ending in one won. */
  readonly at?: AtSeenDto
}

/** Whether an AT reached the cap, the sets it carried on to past its first, and the medals it gained — each where it was seen. */
export interface AtSeenDto {
  readonly completed?: boolean
  readonly sets?: number
  readonly medals?: number
}

/** 設定配分: shares in hundredths of a percent, summing to `10000`. */
export interface DistributionDto {
  readonly shares: readonly BySettingLevelDto<number>[]
}

export interface PosteriorRequest {
  readonly source: SourceDto
  readonly prior?: DistributionDto
  readonly segments: readonly SegmentDto[]
  /** An AT machine's path. */
  readonly path?: PathDto
}

export interface WeightDto {
  readonly settingLevel: number
  readonly probability: number
}

export interface PosteriorDto {
  readonly settingLevels: readonly WeightDto[]
}

export interface TheoreticalValueRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly weights: readonly WeightDto[]
  readonly play: PlayDto
  readonly played: PlayedDto
}

/** The regular games a theoretical value is of: so many, every one worth the same, or an AT machine's path. */
export type PlayedDto = { readonly type: "games"; readonly games: number } | { readonly type: "path"; readonly path: PathDto }

export interface TheoreticalValueDto {
  readonly payoutRate: number
  readonly netPerGame: number
  readonly medals: number
  readonly yen: number
  readonly yenPerHour?: number
}

/** A run in progress, carried across chunks and handed back as received. */
export interface ProgressDto {
  readonly rng: readonly [string, string, string, string]
}

export interface SimulateRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly weights: readonly WeightDto[]
  readonly play: PlayDto
  readonly plan: { readonly sessions: number; readonly games: number }
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

export interface BucketDto {
  readonly fromYen: number
  readonly toYen: number
  readonly count: number
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
  readonly histogram: readonly BucketDto[]
}

export interface SimulateResponse {
  readonly progress: ProgressDto
  readonly summary: SummaryDto
}

export interface EstimateRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly gamesPerSettingLevel: number
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

export interface SettingLevelEstimateDto {
  readonly settingLevel: number
  readonly games: number
  readonly payoutRate: number | null
  /** The 95% margin of `payoutRate`. */
  readonly payoutRateMargin: number | null
}

export interface EstimateSummaryDto {
  readonly gamesPerSettingLevel: number
  readonly finished: boolean
  readonly settingLevels: readonly SettingLevelEstimateDto[]
}

export interface EstimateResponse {
  readonly progress: ProgressDto
  readonly summary: EstimateSummaryDto
}

export type EngineErrorDto =
  | { readonly type: "malformed-request"; readonly detail: string }
  | { readonly type: "invalid-value"; readonly field: string }
  | { readonly type: "unsupported-component"; readonly field: string }
  | { readonly type: "unsupported-spec-version"; readonly version: number; readonly known: number }
  | { readonly type: "no-setting-levels" }
  | { readonly type: "duplicate-setting-level"; readonly at?: string; readonly settingLevel: number }
  | { readonly type: "missing-setting-level"; readonly at: string; readonly settingLevel: number }
  | { readonly type: "unknown-setting-level"; readonly at: string; readonly settingLevel: number }
  | { readonly type: "duplicate-entity"; readonly entity: string }
  | { readonly type: "missing-component"; readonly entity: string; readonly component: string }
  | { readonly type: "conflicting-components"; readonly entity: string; readonly first: string; readonly second: string }
  | { readonly type: "stray-component"; readonly entity: string; readonly component: string }
  | { readonly type: "part-of-non-bonus"; readonly entity: string; readonly of: string }
  | { readonly type: "invalid-probability"; readonly at: string; readonly settingLevel: number; readonly problem: "not-finite" | "out-of-range" }
  | { readonly type: "probabilities-exceed-one"; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "missing-payout"; readonly at: string }
  | { readonly type: "missing-rate"; readonly settingLevel: number }
  | { readonly type: "unknown-rate"; readonly settingLevel: number }
  | { readonly type: "rate-not-from-spec" }
  | { readonly type: "at-not-alone"; readonly entity: string }
  | { readonly type: "missing-base" }
  | { readonly type: "base-without-at" }
  | { readonly type: "first-hit-beyond-ceiling"; readonly at: string; readonly settingLevel: number }
  | { readonly type: "path-without-at" }
  | { readonly type: "played-mismatch" }
  | { readonly type: "mode-without-at"; readonly entity: string }
  | { readonly type: "ceiling-beside-modes"; readonly entity: string }
  | { readonly type: "allotment-not-whole"; readonly settingLevel: number; readonly afterReset: boolean; readonly sum: number }
  | { readonly type: "reset-allotment-partial"; readonly entity: string }
  | { readonly type: "cz-without-at"; readonly entity: string }
  | { readonly type: "first-hit-beside-cz"; readonly entity: string }
  | { readonly type: "reset-ceiling-beside-cz"; readonly entity: string }
  | { readonly type: "empty-set"; readonly entity: string }
  | { readonly type: "empty-net-per-game"; readonly entity: string }
  | { readonly type: "other-net-beyond-whole"; readonly entity: string; readonly sum: number }
  | { readonly type: "unattainable-rate"; readonly entity: string; readonly settingLevel: number }
  | { readonly type: "endless-continuation"; readonly entity: string; readonly settingLevel: number }
  | { readonly type: "payout-table-not-whole"; readonly entity: string; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "needs-cap"; readonly entity: string; readonly component: string }
  | { readonly type: "cap-without-at" }
  | { readonly type: "unknown-count"; readonly segment: number; readonly id: string }
  | { readonly type: "overlapping-counts"; readonly segment: number; readonly id: string }
  | { readonly type: "counts-exceed-games"; readonly segment: number }
  | { readonly type: "prior-mismatch"; readonly settingLevel: number }
  | { readonly type: "invalid-prior"; readonly sum: number }
  | { readonly type: "contradictory-evidence" }

export type Envelope<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: EngineErrorDto }

export type * from "./catalog.ts"
