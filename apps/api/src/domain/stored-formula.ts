import type { GameKindDto } from "@p-lens/contracts"

import * as Pachinko from "./pachinko/formula"
import * as Pachislot from "./pachislot/formula"

/**
 * A formula as the catalog keeps it, whatever its game: how it was made, its
 * figures and basis in its game's shape, and the normalised spec the API made
 * of the basis. The tables never look inside.
 */
export interface StoredFormula {
  readonly kind: "manual" | "simulated"
  readonly figures: unknown
  readonly basis: unknown
  readonly normalized: unknown
  readonly engineSchemaVersion: number | undefined
  /**
   * The version of the engine that checked the figures against the basis,
   * so that formulas checked by an engine that has since come to other
   * figures can be found; none where nothing checked them — a formula typed
   * in, or one stored as its sender's device solved it.
   */
  readonly engineVersion: number | undefined
  /** A pachinko formula's bonuses; none for a pachislot one, whose bonuses are its world's. */
  readonly bonuses: unknown
  readonly derivedFrom: string | undefined
  /** Whether the API checked it: false only for a pachislot formula too heavy to solve here, stored as its sender's device solved it. */
  readonly checked: boolean
}

/** A prepared formula of either game, said with its game so it is stored on a machine of that game. */
export type PreparedOfGame =
  | { readonly gameKind: "pachinko"; readonly formula: Pachinko.PreparedFormula }
  | { readonly gameKind: "pachislot"; readonly formula: Pachislot.PreparedFormula }

const storedPachinko = (formula: Pachinko.PreparedFormula): StoredFormula =>
  formula.kind === "manual"
    ? { kind: "manual", figures: formula.figures, basis: undefined, normalized: undefined, engineSchemaVersion: undefined, engineVersion: undefined, bonuses: formula.bonuses, derivedFrom: formula.derivedFrom, checked: true }
    : {
        kind: formula.kind,
        figures: formula.figures,
        basis: { spec: Pachinko.specOf(formula), conditions: formula.conditions },
        normalized: formula.normalized,
        engineSchemaVersion: formula.engineSchemaVersion,
        engineVersion: formula.engineVersion,
        bonuses: formula.bonuses,
        derivedFrom: formula.derivedFrom,
        checked: true,
      }

const storedPachislot = (formula: Pachislot.PreparedFormula): StoredFormula => ({
  kind: formula.kind,
  figures: formula.figures,
  basis: { spec: Pachislot.specOf(formula), conditions: formula.conditions },
  normalized: formula.normalized,
  engineSchemaVersion: formula.engineSchemaVersion,
  engineVersion: formula.engineVersion,
  bonuses: undefined,
  derivedFrom: formula.derivedFrom,
  checked: formula.checked,
})

export const storedOf = (prepared: PreparedOfGame): StoredFormula =>
  prepared.gameKind === "pachinko" ? storedPachinko(prepared.formula) : storedPachislot(prepared.formula)

export const GAME_KINDS: readonly GameKindDto[] = ["pachinko", "pachislot"]
