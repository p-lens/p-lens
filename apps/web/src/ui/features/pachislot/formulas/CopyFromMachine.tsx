import { createResource, createSignal, Match, Show, Switch, type JSX } from "solid-js"

import { findMachines } from "../../../../application/catalog"
import type { ApplicationError } from "../../../../application/errors"
import { loadMachine } from "../../../../application/pachislot/formulas"
import { ranked } from "../../../../core/formula/standing"
import { worthOf, type Formula } from "../../../../core/pachislot/formula"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { Combobox, type ComboboxOption } from "../../../primitives/combobox"
import { describeError } from "../../../wording/errors"
import { startedFrom } from "./remaking"

/** Where copying from another machine is: not asked for, a machine being looked for, one found with nothing to copy, or failed. */
type Copying =
  | { readonly type: "resting" }
  | { readonly type: "choosing" }
  | { readonly type: "nothing-to-copy"; readonly name: string }
  | { readonly type: "failed"; readonly error: ApplicationError }

const COPY = "似たスペックの機種からコピー"

/**
 * A new machine's formula begun from another machine's: a button that
 * brings up a search of the catalog's machines, and the machine chosen
 * hands over the formula a new one of its own would start from
 * (`startedFrom`) — its world, or the figures typed for it. Which machine is alike is the person's
 * to know; this only finds the one they name. A world is long to type, and a machine is often another under a new name. Nothing of
 * the machine itself is copied: its name, its model name and its release
 * date are the new machine's own, and the formula made is derived from
 * none.
 */
export function CopyFromMachine(props: { readonly onCopied: (formula: Formula, from: string) => void }): JSX.Element {
  const app = useApp()
  const [copying, setCopying] = createSignal<Copying>({ type: "resting" })
  const [machines] = createResource(
    () => copying().type === "choosing",
    async (choosing): Promise<readonly ComboboxOption[]> => {
      if (!choosing) return []
      const found = await findMachines(app.services.catalog, "", "pachislot")
      return found.ok && found.value.type === "found" ? found.value.machines.map((machine) => ({ value: machine.id, label: machine.name })) : []
    },
  )
  const copy = async (machineId: string | undefined): Promise<void> => {
    if (machineId === undefined) return
    const detail = await loadMachine(app.services.catalog, machineId)
    if (!detail.ok) {
      setCopying({ type: "failed", error: detail.error })
      return
    }
    const formula = startedFrom(ranked(detail.value.formulas, worthOf).map((listing) => listing.formula))
    if (formula === undefined) {
      setCopying({ type: "nothing-to-copy", name: detail.value.machine.name })
      return
    }
    setCopying({ type: "resting" })
    props.onCopied(formula, detail.value.machine.name)
  }
  return (
    <div class="flex max-w-md flex-col gap-2">
      <Show
        when={copying().type === "choosing"}
        fallback={
          <div>
            <Button variant="outline" size="small" onClick={() => setCopying({ type: "choosing" })}>
              {COPY}
            </Button>
          </div>
        }
      >
        <div class="flex items-end gap-2">
          <div class="min-w-0 flex-1">
            <Combobox label="コピー元の機種" options={machines() ?? []} value={undefined} onChange={(machineId) => void copy(machineId)} placeholder="機種名で探す" focusedAtOnce />
          </div>
          <Button variant="ghost" size="small" class="shrink-0" onClick={() => setCopying({ type: "resting" })}>
            やめる
          </Button>
        </div>
      </Show>
      <Switch>
        <Match when={((now) => (now.type === "nothing-to-copy" ? now.name : undefined))(copying())} keyed>
          {(name) => <p class="text-xs text-text-muted">「{name}」には、コピーできる算出条件がありません（手入力のものだけです）。</p>}
        </Match>
        <Match when={((now) => (now.type === "failed" ? now.error : undefined))(copying())} keyed>
          {(error) => (
            <p role="alert" class="text-xs text-negative">
              {describeError(error)}
            </p>
          )}
        </Match>
      </Switch>
    </div>
  )
}
