import type { ConditionsDto, SpecDto, NormalizedSpecDto } from "@p-lens/contracts/pachinko"

import type { MachineId } from "../machine/machine"
import type { Figures } from "./figures"

export type FormulaId = string & { readonly __brand: "FormulaId" }

/**
 * What a simulated formula was made from — its 期待値基礎値 — kept so its
 * 計算根拠 can be shown and checked: the spec as entered, the conditions, and
 * the normalised spec the engine solved.
 */
export interface Basis {
  readonly spec: SpecDto
  readonly conditions: ConditionsDto
  readonly normalized: NormalizedSpecDto
  readonly engineSchemaVersion: number
}

/**
 * How a sampled formula's figure was estimated: so many cycles from a seed,
 * so anyone can run the same sampling again and get the same figure.
 */
export interface Sampling {
  readonly cycles: number
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  /** The 95% margin of the estimated 1R トータル確率's "one in". */
  readonly roundChanceMargin: number
}

/**
 * One of the bonuses a machine's jackpots pay, as a formula of it states
 * them: what it goes by, the balls it pays out and the balls spent winning
 * it — 1,500 paid out for 100 shot is 1,400 won. A play records a jackpot
 * as one of the bonuses of the formula it is weighed against. `jackpots`
 * is how many jackpots the bonus is won over, left out where it is one: a
 * machine may give a run of jackpots as one win — 3,000 balls as two
 * jackpots of ten rounds — and a parlor's counter counts each of them.
 */
export interface Bonus {
  readonly name: string
  readonly payout: number
  readonly spent: number
  readonly jackpots?: number
}

/** How a formula's figures came to be: typed in, solved exactly from a basis, or sampled from one. */
export type FormulaMaking =
  | { readonly kind: "manual" }
  | { readonly kind: "simulated"; readonly basis: Basis }
  | { readonly kind: "sampled"; readonly basis: Basis; readonly sampling: Sampling }

/**
 * A 算出条件: figures typed in from somewhere trusted, worked out exactly by
 * the engine from a basis, or estimated by sampling one on the device.
 * Immutable — a formula someone finds wanting is made again as a new one,
 * which may say which it was remade from.
 */
export type Formula = {
  readonly id: FormulaId
  readonly machineId: MachineId
  readonly figures: Figures
  /** The bonuses its jackpots pay, in the order its basis first names them, or as typed where it has none. */
  readonly bonuses: readonly Bonus[]
  readonly derivedFrom: FormulaId | undefined
  readonly createdAt: string
} & FormulaMaking

export type FormulaKind = Formula["kind"]

/** The 期待値基礎値 a formula was made from, if it was made from one. */
export const basisOf = (making: FormulaMaking): Basis | undefined => (making.kind === "manual" ? undefined : making.basis)

/**
 * What a formula makes a play worth, to rank a harsher formula of a machine
 * ahead of a kinder one people have done the same with: the balls a spin
 * comes to in jackpots, a round's balls over the spins a round takes.
 */
export const worthOf = (formula: Pick<Formula, "figures">): number => formula.figures.payoutPerRound / formula.figures.roundChanceOneIn
