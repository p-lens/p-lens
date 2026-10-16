import type { Basis } from "../formula"

/**
 * What a mode the reasoner counts by its place stands for: one of the
 * sheet's own, by its label, or — on a machine without modes — play after
 * an AT, or after a setting change, whose ceilings are its shorter ones.
 */
export type GroundsMode = { readonly type: "own"; readonly label: string } | { readonly type: "after-at" } | { readonly type: "after-reset" }

/** What brings the AT: a CZ, a bonus that wins it at a share — by its label — or nothing, the AT won directly. */
export type GroundsTrigger = { readonly type: "cz" } | { readonly type: "bonus"; readonly label: string } | { readonly type: "at" }

/**
 * What a formula's grounds reason over, to be named in words: the trigger —
 * the CZ or the bonus that brings the AT, or the AT itself — and the modes,
 * in the order the reasoner counts them. Names are never handed to the
 * reasoner, which is told numbers alone.
 */
export interface GroundsNaming {
  readonly trigger: GroundsTrigger
  readonly modes: readonly GroundsMode[]
}

const triggerOf = (basis: Basis): GroundsTrigger => {
  const rules = basis.normalized.atRules
  if (rules?.trigger === undefined) return { type: "at" }
  return rules.triggerIsBonus !== true && rules.triggerPayout === undefined ? { type: "cz" } : { type: "bonus", label: basis.spec.components.label?.[rules.trigger] || "ボーナス" }
}

/** How a formula's grounds name its trigger and its modes. */
export const groundsNamingOf = (basis: Basis): GroundsNaming => {
  const rules = basis.normalized.atRules
  const own = basis.spec.components.mode ?? []
  return {
    trigger: triggerOf(basis),
    modes: (rules?.modes ?? []).map((mode, index): GroundsMode => {
      if (own.includes(mode.id)) return { type: "own", label: basis.spec.components.label?.[mode.id] || mode.id }
      return index === 0 ? { type: "after-at" } : { type: "after-reset" }
    }),
  }
}
