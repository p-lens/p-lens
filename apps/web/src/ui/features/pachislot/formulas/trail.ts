import type { Crumb } from "solid-gathering-shell"

import type { Formula } from "../../../../core/pachislot/formula"
import type { Moves } from "../../../navigation/moves"
import { formulaText } from "../../../wording/pachislot/formula"

/** How deep into a pachislot machine's formulas a screen is. */
export type Depth = "machine" | "formula" | "grounds" | "basis"

const DEPTHS: readonly Depth[] = ["machine", "formula", "grounds", "basis"]

/**
 * The breadcrumb from starting a slot play down to a depth: the machine, its
 * 算出条件, the 計算根拠, the 解析値. Each step but the last goes back.
 */
export const trailTo = (
  moves: Moves,
  depth: Depth,
  machine: { readonly id: string; readonly name: string },
  formula: Pick<Formula, "id" | "figures"> | undefined,
): readonly Crumb[] => {
  const reach = DEPTHS.indexOf(depth)
  const steps: readonly (Crumb | undefined)[] = [
    { label: "スロット開始", onSelect: () => moves.go({ kind: "live-new", game: "slot" }) },
    { label: machine.name, onSelect: () => moves.go({ kind: "pachislot-machine", machineId: machine.id }) },
    formula === undefined || reach < 1
      ? undefined
      : {
          label: `算出条件「${formulaText(formula.figures)}」`,
          onSelect: () => moves.go({ kind: "pachislot-formula", machineId: machine.id, formulaId: formula.id }),
        },
    formula === undefined || reach < 2
      ? undefined
      : { label: "計算根拠", onSelect: () => moves.go({ kind: "pachislot-formula-grounds", machineId: machine.id, formulaId: formula.id }) },
    formula === undefined || reach < 3 ? undefined : { label: "解析値" },
  ]
  return steps.filter((step): step is Crumb => step !== undefined)
}
