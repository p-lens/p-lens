import type { ConditionsDto, NormalizedSpecDto, SpecDto } from "@p-lens/contracts/pachislot"

import type { MachineId } from "../machine/machine"
import type { SettingLevelFigures } from "./figures"

export type FormulaId = string & { readonly __brand: "FormulaId" }
export type SettingDistributionId = string & { readonly __brand: "SettingDistributionId" }

/**
 * What a pachislot formula was made from — its 解析値 — kept so its 計算根拠
 * can be shown and checked, and so a play is weighed by the very tables the
 * engine solved: the world as entered, the conditions, and the normalised
 * spec.
 */
export interface Basis {
  readonly spec: SpecDto
  readonly conditions: ConditionsDto
  readonly normalized: NormalizedSpecDto
  readonly engineSchemaVersion: number
}

/** How a sampled formula's payout rates were estimated, so anyone can run the same sampling again. */
export interface Sampling {
  readonly gamesPerSettingLevel: number
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  /** Each setting level's 95% margin of its estimated payout rate. */
  readonly margins: readonly { readonly settingLevel: number; readonly payoutRateMargin: number }[]
}

/**
 * How a formula's figures came to be: typed in, worked out exactly from its
 * 解析値, or sampled from them. Every kind keeps a basis: one typed in is a
 * world of its bonuses with the 機械割 measured, which is all a setting level
 * is inferred and a play weighed from.
 */
export type FormulaMaking =
  | { readonly kind: "manual"; readonly basis: Basis }
  | { readonly kind: "simulated"; readonly basis: Basis }
  | { readonly kind: "sampled"; readonly basis: Basis; readonly sampling: Sampling }

/** How a formula may be made now: a sampled one is read where a catalog holds it, and made no more — what it estimated, its 解析値 give exactly. */
export type NewFormulaMaking = Exclude<FormulaMaking, { readonly kind: "sampled" }>

export type FormulaKind = FormulaMaking["kind"]

/**
 * A pachislot 算出条件. Immutable — one found wanting is made again as a new
 * one, which may say which it was remade from.
 */
export type Formula = {
  readonly id: FormulaId
  readonly machineId: MachineId
  readonly figures: readonly SettingLevelFigures[]
  readonly derivedFrom: FormulaId | undefined
  /** 検算なし: kept as its maker's device solved it, its 解析値 too heavy for the shared catalog to check. */
  readonly unchecked: boolean
  readonly createdAt: string
} & FormulaMaking

/** One setting level's share of a 設定配分, in hundredths of a percent. */
export interface SettingLevelShare {
  readonly settingLevel: number
  readonly basisPoints: number
}

/**
 * A 設定配分: how a parlor is thought to spread a machine's setting levels,
 * the prior what is seen at a cabinet updates. Registered for a machine and
 * stood behind the way a formula is; immutable, remade as a new one.
 */
export interface SettingDistribution {
  readonly id: SettingDistributionId
  readonly machineId: MachineId
  /** What it is a spread for, as its maker put it: 平日, 旧イベント日. */
  readonly label: string
  readonly shares: readonly SettingLevelShare[]
  readonly derivedFrom: SettingDistributionId | undefined
  readonly createdAt: string
}

/**
 * What a formula makes a play worth, to rank a harsher formula of a machine
 * ahead of a kinder one people have done the same with: its 機械割, taken
 * evenly over its setting levels.
 */
export const worthOf = (formula: Pick<Formula, "figures">): number =>
  formula.figures.length === 0 ? 0 : formula.figures.reduce((sum, figures) => sum + figures.payoutRate, 0) / formula.figures.length
