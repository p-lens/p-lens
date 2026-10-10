import type { MachineBonusDto, StandingDto } from "../catalog.ts"
import type { ConditionsDto, SpecDto, NormalizedSpecDto } from "./engine.ts"

/**
 * What a pachinko formula is in the shared catalog: its figures, its
 * 期待値基礎値 and, for a sampled one, how it was sampled. The catalog itself —
 * machines, marks, 設定配分 — is one for both games (`catalog.ts`).
 */

export interface FiguresDto {
  readonly roundChanceOneIn: number
  readonly payoutPerRound: number
  readonly totalChanceOneIn?: number
  readonly spinsPerHour?: number
}

/** A simulated pachinko formula's 期待値基礎値, with the normalised spec the engine made of it. */
export interface BasisDto {
  readonly spec: SpecDto
  readonly conditions: ConditionsDto
  readonly normalized: NormalizedSpecDto
  readonly engineSchemaVersion: number
}

/** How a sampled pachinko formula's 1R chance was estimated: so many cycles from a seed, its "one in" within this 95% margin. */
export interface SamplingDto {
  readonly cycles: number
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  readonly roundChanceMargin: number
}

export type FormulaKindDto = "manual" | "simulated" | "sampled"

export interface FormulaDto {
  readonly id: string
  readonly machineId: string
  readonly kind: FormulaKindDto
  readonly figures: FiguresDto
  readonly basis?: BasisDto
  readonly sampling?: SamplingDto
  /** The bonuses its jackpots pay, in the order its basis first names them, or as typed where it has none: what a play records a jackpot as. */
  readonly bonuses: readonly MachineBonusDto[]
  readonly derivedFrom?: string
  readonly contentHash: string
  readonly createdAt: string
  readonly standing: StandingDto
}

/**
 * A pachinko formula as sent to be made. One worked out from a basis sends
 * its spec and conditions; the API normalises them itself and keeps the
 * result, and refuses figures that are not what that basis comes to — a
 * sampled one's 1R chance within five standard errors by its own margin.
 * Its bonuses are named by whoever makes it: one worked out from a basis
 * sends one for each bonus its basis's jackpots pay, in their order, paying
 * out and taking what those do, and anything else is refused; one typed in
 * sends at least one.
 */
export interface NewFormulaDto {
  readonly kind: FormulaKindDto
  readonly figures: FiguresDto
  readonly basis?: { readonly spec: SpecDto; readonly conditions: ConditionsDto }
  readonly sampling?: SamplingDto
  readonly bonuses: readonly MachineBonusDto[]
  readonly derivedFrom?: string
}
