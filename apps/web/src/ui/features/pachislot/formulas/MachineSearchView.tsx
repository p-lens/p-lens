import { createResource, For, Match, onMount, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { findMachines } from "../../../../application/catalog"
import { bookNameOf, type MachineSummary } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { PlusIcon } from "../../../primitives/icons"
import { letGoOfFocus } from "../../../primitives/let-go"
import { EmptyState, Loaded } from "../../../primitives/states"
import { TextField } from "../../../primitives/text-field"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../primitives/tooltip"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { modelNameText, slashDay, UNDELIVERED, UNDELIVERED_TITLE } from "../../../wording/catalog"
import { useStartForm } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"

function MachineList(props: { readonly machines: readonly MachineSummary[]; readonly onChoose: (machine: MachineSummary) => void }): JSX.Element {
  return (
    <ul class="flex flex-col gap-0.5">
      <For each={props.machines}>
        {(machine) => (
          <li>
            <button
              type="button"
              onClick={() => props.onChoose(machine)}
              class="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left hover:bg-surface-3/60"
            >
              <span class="flex min-w-0 flex-col">
                <span class="break-words font-bold text-text-primary">{machine.name}</span>
                <span class="truncate text-xs text-text-muted">{modelNameText(machine.modelName)}</span>
              </span>
              <span class="shrink-0 text-xs tabular-nums text-text-muted">{slashDay(machine.releasedOn)}</span>
            </button>
          </li>
        )}
      </For>
    </ul>
  )
}

/**
 * Finding the pachislot machine to play: a search bar over every machine in
 * the pachislot catalog, newest release first, with a plus beside it for one
 * not listed. Choosing one returns to the start of the play with it; a
 * machine not in the catalog is registered by making its first formula.
 * The search bar takes the focus as the view opens, and lets go of it once
 * the list is dragged, so a phone's keyboard does not hide what is read.
 */
export function MachineSearchView(props: { readonly place: Place; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  onMount(() => void app.delivery.refresh())
  const [finding] = createResource(
    () => ({ query: props.query, revision: app.revision() }),
    (source) => findMachines(app.services.catalog, source.query, "pachislot"),
  )
  const searched = (): string => props.query.trim()
  const choose = (machine: MachineSummary): void => {
    start.updatePachislot({ machine: { type: "catalog", machineId: machine.id, name: bookNameOf(machine) } })
    moves.up(props.place)
  }
  const create = (): void => {
    start.updatePachislot({ machine: { type: "none" }, formulaId: undefined, prior: undefined, remakeFrom: undefined, newMachineName: searched(), newMachineModelName: "", newMachineKeywords: "", newMachineReleasedOn: "" })
    moves.go({ kind: "pachislot-formula-new", tab: "manual" })
  }
  const createLabel = (): string => (searched() === "" ? "新しい機種の算出条件を作る" : `「${searched()}」の算出条件を作る`)
  const trail = () => [{ label: "スロット開始", onSelect: () => moves.up(props.place) }, { label: "機種選択" }]
  return (
    <MainContent header={<ViewHeader place={props.place} title="機種選択" trail={trail()} />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex items-end gap-2">
            <div class="min-w-0 flex-1">
              <TextField label="機種を検索" value={props.query} onChange={(query) => moves.refine(props.place, query)} placeholder="機種名" focusedOnShow />
            </div>
            <Tooltip placement="top">
              <TooltipTrigger
                as="button"
                type="button"
                aria-label={createLabel()}
                onClick={create}
                class="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-semipro-ink text-semipro-ink hover:border-semipro-ink-hover hover:text-semipro-ink-hover [&_svg]:size-5"
              >
                <PlusIcon />
              </TooltipTrigger>
              <TooltipContent>{createLabel()}</TooltipContent>
            </Tooltip>
          </div>
          <div onTouchMove={letGoOfFocus}>
            <Loaded outcome={finding()}>
              {(found) => (
                <Switch>
                  <Match when={found.type === "found" && found.machines} keyed>
                    {(machines) => <MachineList machines={machines} onChoose={choose} />}
                  </Match>
                  <Match when={found.type === "no-match"}>
                    <EmptyState title="該当する機種がありません">「{searched()}」の算出条件を作ると、機種も一緒に登録されます。</EmptyState>
                  </Match>
                  <Match when={found.type === "none-registered" && app.delivery.state().type === "failed"}>
                    <EmptyState title={UNDELIVERED_TITLE}>{UNDELIVERED}</EmptyState>
                  </Match>
                  <Match when={found.type === "none-registered"}>
                    <EmptyState title="スロットの機種が1件も登録されていません">算出条件を作ると、その機種も一緒に登録されます。</EmptyState>
                  </Match>
                </Switch>
              )}
            </Loaded>
          </div>
        </div>
      </div>
    </MainContent>
  )
}
