import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { loadMachine } from "../../../../application/pachislot/formulas"
import { bookNameOf } from "../../../../core/catalog/catalog"
import { ranked, sameWorth } from "../../../../core/formula/standing"
import { worthOf } from "../../../../core/pachislot/formula"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { EmptyState, Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describeError } from "../../../wording/errors"
import { useBookFavorites } from "../../live/book-favorites"
import { useStartForm } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { FormulaCard, SettingDistributionCard } from "./Cards"
import { remadeIn, startedFrom } from "./remaking"
import { trailTo } from "./trail"
import { useActions } from "./use-actions"

const SECTION_TITLE = "text-xs font-bold uppercase tracking-wide text-text-secondary"

/**
 * A pachislot machine: its formulas, best first by verification then
 * adoption, and its 設定配分 the same way — the prior a play's setting level
 * is inferred against.
 */
export function MachineView(props: { readonly place: Place; readonly machineId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  const actions = useActions()
  const favorites = useBookFavorites()
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
            <div class="flex flex-col gap-6 p-4">
              <Show when={failure()} keyed>
                {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
              </Show>
              <section class="flex flex-col gap-3">
                <div class="flex items-center justify-between gap-3">
                  <h2 class={SECTION_TITLE}>算出条件一覧</h2>
                  <Button
                    variant="nerdpro"
                    size="small"
                    onClick={() => {
                      const from = startedFrom(ranked(found.formulas, worthOf).map((listing) => listing.formula))
                      start.updatePachislot({ machine: { type: "catalog", machineId: found.machine.id, name: bookNameOf(found.machine) }, remakeFrom: from?.id })
                      moves.go({ kind: "pachislot-formula-new", tab: from === undefined ? "manual" : remadeIn(from) })
                    }}
                  >
                    算出条件を作る
                  </Button>
                </div>
                <For each={ranked(found.formulas, worthOf)}>
                  {(listing) => (
                    <FormulaCard
                      listing={listing}
                      favorite={favorites.keeps(listing.formula.id)}
                      mine={actions.mine(listing.formula.id)}
                      onHelp={() => moves.go({ kind: "pachislot-formula", machineId: found.machine.id, formulaId: listing.formula.id })}
                      onToggleFavorite={() => favorites.press({ type: "formula", id: listing.formula.id }, setFailure)}
                      onUse={() => actions.useFormula(listing.formula, bookNameOf(found.machine))}
                    />
                  )}
                </For>
              </section>
              <section class="flex flex-col gap-3">
                <div class="flex items-center justify-between gap-3">
                  <h2 class={SECTION_TITLE}>設定配分一覧</h2>
                  <Button variant="semipro" size="small" onClick={() => moves.go({ kind: "pachislot-distribution-new", machineId: found.machine.id })}>
                    設定配分を作る
                  </Button>
                </div>
                <p class="text-sm text-text-muted">店が設定をどう使っているかの見立てです。何も選ばなければ、全設定が均等として推測します。</p>
                <Show when={found.distributions.length > 0} fallback={<EmptyState title="設定配分はまだありません">平日・イベント日など、見立てを登録できます。</EmptyState>}>
                  <For each={ranked(found.distributions, sameWorth)}>
                    {(listing) => (
                      <SettingDistributionCard
                        listing={listing}
                        favorite={favorites.keeps(listing.formula.id)}
                        mine={actions.mine(listing.formula.id)}
                        onToggleFavorite={() => favorites.press({ type: "distribution", id: listing.formula.id }, setFailure)}
                        onToggleAdoption={() => actions.toggle("distribution", listing, "adoption", setFailure)}
                        onUse={() => actions.useDistribution(listing.formula, bookNameOf(found.machine))}
                      />
                    )}
                  </For>
                </Show>
              </section>
            </div>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
