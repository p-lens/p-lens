import { createResource, createSignal, For, Index, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { addSettingDistribution, loadMachine } from "../../../../application/pachislot/formulas"
import type { PachislotMachineDetail } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { createNudge, redText } from "../../../primitives/nudge"
import { Loaded } from "../../../primitives/states"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describeError } from "../../../wording/errors"
import { ViewHeader } from "../../shell/ViewHeader"
import { type DistributionForm, EMPTY_DISTRIBUTION, readDistributionForm, sharesTotal } from "./distribution-form"
import { trailTo } from "./trail"
import type { FormProblem } from "./world-form"

/** The setting levels a machine's formulas have between them, lowest first. */
const levelsOf = (detail: PachislotMachineDetail): readonly number[] =>
  [...new Set(detail.formulas.flatMap((listing) => listing.formula.basis.spec.resources.settingLevels))].toSorted((left, right) => left - right)

function Editor(props: { readonly detail: PachislotMachineDetail }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [form, setForm] = createSignal<DistributionForm>(EMPTY_DISTRIBUTION)
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const [saving, setSaving] = createSignal(false)
  const nudge = createNudge()
  const levels = () => levelsOf(props.detail)
  const read = () => readDistributionForm(form(), levels())
  const problems = (): readonly FormProblem[] => {
    const current = read()
    return current.ok ? [] : current.error
  }
  const total = () => sharesTotal(form(), levels())
  const save = async (): Promise<void> => {
    settleTyping()
    const current = read()
    if (saving()) return
    if (!current.ok) {
      nudge.nudge()
      return
    }
    setSaving(true)
    const saved = await addSettingDistribution(app.services.catalog, props.detail.machine.id, { ...current.value, derivedFrom: undefined })
    setSaving(false)
    if (!saved.ok) {
      setFailure(saved.error)
      return
    }
    app.delivery.awaitShared()
    moves.go({ kind: "pachislot-machine", machineId: props.detail.machine.id })
  }
  return (
    <div class="flex flex-col gap-5 p-4">
      <p class="text-sm text-text-muted">
        この機種で、店が各設定をどのくらい使っていると見るかです。設定の推測は、この見立てから出発して、実際に出たボーナスや小役で更新されます。
      </p>
      <div class="max-w-md">
        <TextField label="名前" value={form().label} onChange={(label) => setForm({ ...form(), label })} placeholder="平日・イベント日…" />
      </div>
      <div class="grid max-w-xl grid-cols-3 gap-2 sm:grid-cols-6">
        <Index each={levels()}>
          {(level) => (
            <TextField
              label={`設定${level()}`}
              value={form().shares[String(level())] ?? ""}
              onChange={(share) => setForm({ ...form(), shares: { ...form().shares, [String(level())]: share } })}
              inputMode="decimal"
              suffix="%"
              compact
            />
          )}
        </Index>
      </div>
      <p class="text-sm tabular-nums" classList={total() === 10_000 ? { "text-text-secondary": true } : redText(nudge.red())}>
        合計 {(total() / 100).toFixed(2)}%（100% にしてください。空欄は 0% です）
      </p>
      <Show when={nudge.red()}>
        <ul class="text-sm text-negative">
          <For each={problems().filter((problem) => problem.field !== "合計")}>{(problem) => <li>{problem.field}: 正しく入れてください</li>}</For>
        </ul>
      </Show>
      <Show when={failure()} keyed>
        {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
      </Show>
      <div>
        <Button variant="semipro" onClick={() => void save()}>設定配分を登録する</Button>
      </div>
    </div>
  )
}

/** Registering a 設定配分 for a pachislot machine: a label, and each of its setting levels' share. */
export function SettingDistributionEditorView(props: { readonly place: Place; readonly machineId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [detail] = createResource(
    () => ({ machineId: props.machineId, revision: app.revision() }),
    (source) => loadMachine(app.services.catalog, source.machineId),
  )
  const trail = () => {
    const found = detail()
    return found?.ok === true ? [...trailTo(moves, "machine", found.value.machine, undefined), { label: "設定配分を登録" }] : undefined
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="設定配分を登録" trail={trail()} />}>
      <div class="max-w-5xl">
        <Loaded outcome={detail()}>{(found) => <Editor detail={found} />}</Loaded>
      </div>
    </MainContent>
  )
}
