import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { loadMachine } from "../../../../application/pachinko/formulas"
import { bookNameOf } from "../../../../core/catalog/catalog"
import { ranked } from "../../../../core/formula/standing"
import { worthOf } from "../../../../core/pachinko/formula"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describeError } from "../../../wording/errors"
import { useBookFavorites } from "../../live/book-favorites"
import { useStartBallValue, useStartForm } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { FormulaCard } from "./FormulaCard"
import { trailTo } from "./trail"
import { useActions } from "./use-actions"

/** Every formula of a machine, best first by verification, then adoption. */
export function MachineView(props: { readonly place: Place; readonly machineId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  const actions = useActions()
  const favorites = useBookFavorites()
  const ballValue = useStartBallValue()
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const [detail] = createResource(
    () => ({ machineId: props.machineId, revision: app.revision() }),
    (source) => loadMachine(app.services.catalog, source.machineId),
  )
  const trail = () => {
    const found = detail()
    return found?.ok === true ? trailTo(moves, "machine", found.value.machine, undefined) : undefined
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="機種" trail={trail()} />}>
      <div class="max-w-5xl">
        <Loaded outcome={detail()}>
          {(found) => (
            <div class="flex flex-col gap-3 p-4">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-xs font-bold uppercase tracking-wide text-text-secondary">算出条件一覧</h2>
                <Button
                  variant="semipro"
                  size="small"
                  onClick={() => {
                    start.updatePachinko({ machine: { type: "catalog", machineId: found.machine.id, name: bookNameOf(found.machine) }, remakeFrom: undefined })
                    moves.go({ kind: "pachinko-formula-new", tab: "manual" })
                  }}
                >
                  算出条件を作る
                </Button>
              </div>
              <Show when={failure()} keyed>
                {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
              </Show>
              <For each={ranked(found.formulas, worthOf)}>
                {(listing) => (
                  <FormulaCard
                    listing={listing}
                    favorite={favorites.keeps(listing.formula.id)}
                    ballValue={ballValue()}
                    onHelp={() => moves.go({ kind: "pachinko-formula", machineId: found.machine.id, formulaId: listing.formula.id })}
                    onToggleFavorite={() => favorites.press({ type: "formula", id: listing.formula.id }, setFailure)}
                    onUse={() => actions.use(listing.formula, bookNameOf(found.machine))}
                  />
                )}
              </For>
            </div>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
