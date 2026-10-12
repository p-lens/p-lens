import type { Formula, FormulaKind } from "../../../../core/pachislot/formula"
import type { FormulaTab } from "../../../navigation/place"
import { statesRate } from "./world-form"

const REMADE_IN: Readonly<Record<FormulaKind, FormulaTab>> = { manual: "manual", simulated: "basis", sampled: "simulator" }

/** Where a formula is made again: in the tab it was made in — but one whose basis states its 機械割 where that can be typed, whatever it was made in. */
export const remadeIn = (formula: Formula): FormulaTab => (statesRate(formula.basis.spec, formula.basis.conditions) ? "manual" : REMADE_IN[formula.kind])

/**
 * The formula a new one of a machine starts from, where nobody chose one:
 * the first in the list as it is shown that was not typed in. A machine's
 * world is long to type and seldom wrong in more than a figure, so a new
 * formula opens on one already there, to be changed; a formula typed in
 * is as quick typed again, and a machine with no other starts empty.
 */
export const startedFrom = (listed: readonly Formula[]): Formula | undefined => listed.find((formula) => remadeIn(formula) !== "manual")
