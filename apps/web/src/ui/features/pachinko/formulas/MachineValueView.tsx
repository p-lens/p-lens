import { createEffect, createResource, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadMachine } from "../../../../application/pachinko/formulas"
import { ranked } from "../../../../core/formula/standing"
import { worthOf } from "../../../../core/pachinko/formula"
import { useApp } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { ViewHeader } from "../../shell/ViewHeader"

/**
 * The way in from outside the app to a machine's 期待値算出: its best
 * formula as the list ranks them now, with the sheet laid over it, in
 * place of this address; the machine's list where it has no formula.
 */
export function MachineValueView(props: { readonly place: Place; readonly machineId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [detail] = createResource(() => props.machineId, (machineId) => loadMachine(app.services.catalog, machineId))
  createEffect(() => {
    const found = detail()
    if (found?.ok !== true) return
    const best = ranked(found.value.formulas, worthOf)[0]
    moves.replace(
      best === undefined
        ? { kind: "pachinko-machine", machineId: found.value.machine.id }
        : { kind: "pachinko-formula-value", machineId: found.value.machine.id, formulaId: best.formula.id },
    )
  })
  return (
    <MainContent header={<ViewHeader place={props.place} title="算出条件" />}>
      <Loaded outcome={detail()}>{() => undefined}</Loaded>
    </MainContent>
  )
}
