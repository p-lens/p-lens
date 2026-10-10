import type { StandingDto } from "../catalog.ts"
import type { BySettingLevelDto, ConditionsDto, NormalizedSpecDto, SpecDto } from "./engine.ts"

/**
 * What a pachislot formula is in the shared catalog: its figures, its 解析値
 * and, for a sampled one, how it was sampled. The catalog itself — machines,
 * marks, 設定配分 — is one for both games (`catalog.ts`).
 */

/** One setting level's figures: its 機械割, each bonus's odds and their 合算, and on an AT machine what an AT comes to. */
export interface FormulaSettingLevelFiguresDto {
  readonly settingLevel: number
  /** 機械割 as a ratio: `1.055` is 105.5%. */
  readonly payoutRate: number
  readonly bonuses: readonly { readonly id: string; readonly oneIn: number }[]
  readonly combinedOneIn: number
  readonly at?: { readonly gain: number; readonly completion: number }
}

/** A formula's 解析値 as sent: the world and how its 機械割 is come to. */
export interface SentBasisDto {
  readonly spec: SpecDto
  readonly conditions: ConditionsDto
}

/** A formula's 解析値 as stored, with the normalised spec the API made of it. */
export interface BasisDto extends SentBasisDto {
  readonly normalized: NormalizedSpecDto
  readonly engineSchemaVersion: number
}

/** How a sampled formula's 機械割 were estimated, so the sampling can be run again. */
export interface SamplingDto {
  readonly gamesPerSettingLevel: number
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  /** Each setting level's 95% margin of its estimated payout rate. */
  readonly margins: readonly { readonly settingLevel: number; readonly payoutRateMargin: number }[]
}

export type FormulaKindDto = "manual" | "simulated" | "sampled"

export interface FormulaDto {
  readonly id: string
  readonly machineId: string
  readonly kind: FormulaKindDto
  readonly figures: readonly FormulaSettingLevelFiguresDto[]
  readonly basis: BasisDto
  readonly sampling?: SamplingDto
  readonly derivedFrom?: string
  readonly contentHash: string
  readonly createdAt: string
  readonly standing: StandingDto
}

/**
 * A pachislot formula as sent to be made. The API normalises its 解析値 itself
 * and keeps the result, and refuses figures that are not what they come to —
 * a sampled formula's 機械割 within five standard errors of it.
 */
export interface NewFormulaDto {
  readonly kind: FormulaKindDto
  readonly figures: readonly FormulaSettingLevelFiguresDto[]
  readonly basis: SentBasisDto
  readonly sampling?: SamplingDto
  readonly derivedFrom?: string
}

/** 設定配分: a pachislot machine's prior, in hundredths of a percent for each setting level it has, summing to `10000`. */
export interface SettingDistributionDto {
  readonly id: string
  readonly machineId: string
  readonly label: string
  readonly shares: readonly BySettingLevelDto<number>[]
  readonly derivedFrom?: string
  readonly contentHash: string
  readonly createdAt: string
  readonly standing: StandingDto
}

/** A 設定配分 as sent to be made. */
export interface NewSettingDistributionDto {
  readonly label: string
  readonly shares: readonly BySettingLevelDto<number>[]
  readonly derivedFrom?: string
}
