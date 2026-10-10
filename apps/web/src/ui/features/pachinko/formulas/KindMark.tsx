import type { JSX } from "solid-js"

import type { FormulaKind } from "../../../../core/pachinko/formula"
import { CalculatorIcon, ComputerIcon, FistIcon } from "../../../primitives/icons"
import { kindName } from "../../../wording/pachinko/formula"

const MARKS: Readonly<Record<FormulaKind, (label: string) => JSX.Element>> = {
  manual: (label) => <FistIcon label={label} />,
  simulated: (label) => <CalculatorIcon label={label} />,
  sampled: (label) => <ComputerIcon label={label} />,
}

/** How a formula was made, as a mark beside its figures: a fist for typed in, a calculator for worked out, a computer for sampled. */
export function KindMark(props: { readonly kind: FormulaKind }): JSX.Element {
  return (
    <span class="flex shrink-0 text-text-muted [&_svg]:size-4" title={kindName(props.kind)}>
      {MARKS[props.kind](kindName(props.kind))}
    </span>
  )
}
