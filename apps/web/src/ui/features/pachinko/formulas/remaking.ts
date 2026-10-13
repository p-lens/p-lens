import type { Formula, FormulaKind } from "../../../../core/pachinko/formula"
import type { FormulaTab } from "../../../navigation/place"

const REMADE_IN: Readonly<Record<FormulaKind, FormulaTab>> = { manual: "manual", simulated: "basis", sampled: "basis" }

/** Where a formula is made again: in the tab it was made in. */
export const remadeIn = (formula: Formula): FormulaTab => REMADE_IN[formula.kind]

/**
 * The formula a new one of a machine starts from, where nobody chose one:
 * the first in the list as it is shown that was not typed in. A machine's
 * spec is long to type and seldom wrong in more than a figure, so a new
 * formula opens on one already there, to be changed; a formula typed in
 * has no basis to start from, and a machine with no other starts empty.
 */
export const startedFrom = (listed: readonly Formula[]): Formula | undefined => listed.find((formula) => remadeIn(formula) !== "manual")
