import { createResource, For, Match, onMount, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { findMachines } from "../../../../application/catalog"
import { bookNameOf, type MachineSummary } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { PlusIcon } from "../../../primitives/icons"
import { EmptyState, Loaded } from "../../../primitives/states"
import { TextField } from "../../../primitives/text-field"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../primitives/tooltip"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { useStartForm } from "../../live/start-form"
import { modelNameText, slashDay } from "../../../wording/catalog"
import { hitChanceText } from "../../../wording/pachinko/machine"
import { ViewHeader } from "../../shell/ViewHeader"
import { probabilitiesText } from "./spec-text"

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
              <span class="flex shrink-0 flex-col items-end text-xs tabular-nums text-text-muted">
                <span>{slashDay(machine.releasedOn)}</span>
                <span>{hitChanceText(machine.hitChance ?? probabilitiesText(machine.formulaHitChances))}</span>
              </span>
            </button>
          </li>
        )}
      </For>
    </ul>
  )
}

/**
 * Finding the machine to play: a search bar over the list of every machine,
 * newest release first, with a plus beside it for a machine not listed. Choosing one returns to the start of the play with it; a
 * machine not in the catalog is registered by making its first formula.
 */
export function MachineSearchView(props: { readonly place: Place; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  onMount(app.delivery.refresh)
  const [finding] = createResource(
    () => ({ query: props.query, revision: app.revision() }),
    (source) => findMachines(app.services.catalog, source.query, "pachinko"),
  )
  const searched = (): string => props.query.trim()
  const choose = (machine: MachineSummary): void => {
    start.updatePachinko({ machine: { type: "catalog", machineId: machine.id, name: bookNameOf(machine) }, formulaId: undefined })
    moves.up(props.place)
  }
  const create = (): void => {
    start.updatePachinko({ machine: { type: "none" }, formulaId: undefined, remakeFrom: undefined, newMachineName: searched(), newMachineModelName: "", newMachineKeywords: "", newMachineHitChance: "", newMachineReleasedOn: "" })
    moves.go({ kind: "pachinko-formula-new", tab: "manual" })
  }
  const createLabel = (): string => (searched() === "" ? "新しい機種の算出条件を作る" : `「${searched()}」の算出条件を作る`)
  const trail = () => [{ label: "パチンコ開始", onSelect: () => moves.up(props.place) }, { label: "機種選択" }]
  return (
    <MainContent header={<ViewHeader place={props.place} title="機種選択" trail={trail()} />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex items-end gap-2">
            <div class="min-w-0 flex-1">
              <TextField label="機種を検索" value={props.query} onChange={(query) => moves.refine(props.place, query)} placeholder="機種名" />
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
          <Loaded outcome={finding()}>
            {(found) => (
              <Switch>
                <Match when={found.type === "found" && found.machines} keyed>
                  {(machines) => <MachineList machines={machines} onChoose={choose} />}
                </Match>
                <Match when={found.type === "no-match"}>
                  <EmptyState title="該当する機種がありません">「{searched()}」の算出条件を作ると、機種も一緒に登録されます。</EmptyState>
                </Match>
                <Match when={found.type === "none-registered"}>
                  <EmptyState title="機種が1件も登録されていません">算出条件を作ると、その機種も一緒に登録されます。</EmptyState>
                </Match>
              </Switch>
            )}
          </Loaded>
        </div>
      </div>
    </MainContent>
  )
}
