import type { JSX } from "solid-js"

import type { FormulaKind } from "../../../../core/pachislot/formula"
import { CalculatorIcon, ComputerIcon, FistIcon } from "../../../primitives/icons"
import { kindName } from "../../../wording/pachislot/formula"

const MARKS: Readonly<Record<FormulaKind, (label: string) => JSX.Element>> = {
  manual: (label) => <FistIcon label={label} />,
  simulated: (label) => <CalculatorIcon label={label} />,
  sampled: (label) => <ComputerIcon label={label} />,
}

/** How a pachislot formula was made: a fist for typed in, a calculator for worked out from 解析値, a computer for sampled. */
export function KindMark(props: { readonly kind: FormulaKind }): JSX.Element {
  return (
    <span class="flex shrink-0 text-text-muted [&_svg]:size-4" title={kindName(props.kind)}>
      {MARKS[props.kind](kindName(props.kind))}
    </span>
  )
}
