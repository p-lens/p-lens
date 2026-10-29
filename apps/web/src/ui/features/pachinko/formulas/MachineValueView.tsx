import { createEffect, createResource, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Outcome } from "../../../../application/errors"
import { loadMachine } from "../../../../application/pachinko/formulas"
import { ranked } from "../../../../core/formula/standing"
import { worthOf } from "../../../../core/pachinko/formula"
import { useApp, type DeliveryState } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { ViewHeader } from "../../shell/ViewHeader"
import { missingUndelivered } from "../../catalog/undelivered"

/** A machine not found while the catalog is still being delivered: not yet known to be missing, so still loading. */
const stillComing = <T,>(outcome: Outcome<T> | undefined, delivery: DeliveryState): Outcome<T> | undefined =>
  outcome?.ok === false && outcome.error.type === "catalog" && outcome.error.error.type === "machine-missing" && delivery.type === "refreshing" ? undefined : outcome

/**
 * The way in from outside the app to a machine's 期待値算出: its best
 * formula as the list ranks them now, with the sheet laid over it, in
 * place of this address; the machine's list where it has no formula.
 * The machine is looked for again whenever the catalog is delivered, as a
 * person come from outside is often new and the catalog not yet here, and
 * it is loading, not missing, until the delivery under way has come.
 */
export function MachineValueView(props: { readonly place: Place; readonly machineId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [detail] = createResource(
    () => ({ machineId: props.machineId, revision: app.revision() }),
    (source) => loadMachine(app.services.catalog, source.machineId),
  )
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
      <Loaded outcome={detail.loading ? undefined : missingUndelivered(stillComing(detail(), app.delivery.state()), app.delivery.state())}>{() => undefined}</Loaded>
    </MainContent>
  )
}
