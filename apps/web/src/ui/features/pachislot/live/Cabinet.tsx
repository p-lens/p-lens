import { createMemo, createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { findMachines } from "../../../../application/catalog"
import type { ApplicationError } from "../../../../application/errors"
import { changeCabinet } from "../../../../application/live-play"
import { loadMachine } from "../../../../application/pachislot/formulas"
import { bookNameOf, shownNameOf, type MachineSummary } from "../../../../core/catalog/catalog"
import { machineMatches } from "../../../../core/catalog/description"
import { autoSelect, selectById, type Selection } from "../../../../core/formula/standing"
import type { MachineChange, PlayDraft } from "../../../../core/live-play/draft"
import { worthOf, type Formula } from "../../../../core/pachislot/formula"
import { selectPrior } from "../../../../core/pachislot/prior"
import { snapshotOf } from "../../../../core/pachislot/snapshot"
import { readableBy } from "../../../../core/pachislot/weighing"
import { parsePlayLog } from "../../../../core/play-log/checkpoint"
import { isWritableText } from "../../../../core/tally/validate"
import { useApp } from "../../../context"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { Button } from "../../../primitives/button"
import { copyText } from "../../../primitives/clipboard"
import { Combobox, holdsTypedOnly } from "../../../primitives/combobox"
import { CopyIcon, QuestionIcon } from "../../../primitives/icons"
import { createNudge } from "../../../primitives/nudge"
import { PencilledBubble } from "../../../primitives/pencilled-bubble"
import { HintedIconButton } from "../../../primitives/popover"
import { Select } from "../../../primitives/select"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { describeError } from "../../../wording/errors"
import { formulaHandle, formulaNameAmong } from "../../../wording/pachislot/formula"
import { useBookFavorites } from "../../live/book-favorites"
import { useStartForm, type CabinetChoice } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { ChoiceReason } from "../start/ChoiceFields"

/** Where saying a play's cabinet anew is: being typed, being kept, or failed to be kept. */
type Saving = { readonly type: "typing" } | { readonly type: "keeping" } | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * Where a pachislot play in progress is said anew to be: the cabinet's
 * number, its machine and the formula it is weighed by. A play begun on
 * the wrong model of a machine — its figures unlike what the cabinet
 * feels like — is put on the right one here and not begun again. Nothing
 * of the seat as it was found is asked. The 設定配分 the play was begun
 * with stays while the machine does; another machine brings its own. What
 * the play has counted stands where the formula it is now weighed by names
 * it, and is let go of where that formula does not. It is laid out as the
 * start screen's machine is — the machine, its formula beside it with the
 * buttons that copy it and open its grounds — with the cabinet's number
 * across from the heading, behind its pencil. What is chosen is kept with
 * the start form, so a look at a formula's grounds and back does not lose
 * it.
 */
export function Cabinet(props: { readonly place: Place; readonly draft: PlayDraft }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  /** What is chosen so far: what was being chosen for this play, or the play as it is. */
  const chosen = (): CabinetChoice => {
    const kept = start.form().cabinet
    return kept?.playId === props.draft.id ? kept : { playId: props.draft.id, cabinetNumber: props.draft.cabinetNumber ?? "", machineId: props.draft.pachislot?.formula.machineId, formulaId: props.draft.pachislot?.formula.id }
  }
  const choose = (change: Partial<CabinetChoice>): void => start.update({ cabinet: { ...chosen(), ...change } })
  const machineId = createMemo(() => chosen().machineId)
  const formulaId = createMemo(() => chosen().formulaId)
  const cabinetNumber = createMemo(() => chosen().cabinetNumber)
  const [machineTyped, setMachineTyped] = createSignal("")
  const [saving, setSaving] = createSignal<Saving>({ type: "typing" })
  const nudge = createNudge()
  const [catalogued] = createResource(() => findMachines(app.services.catalog, "", "pachislot"))
  const machines = (): readonly MachineSummary[] => {
    const found = catalogued()
    return found?.ok === true && found.value.type === "found" ? found.value.machines : []
  }
  const [detail] = createResource(machineId, (id) => loadMachine(app.services.catalog, id))
  const favorites = useBookFavorites()
  /** The formula the play is to be weighed by: the one chosen, or — a machine just chosen — the one the machine's own standing gives. */
  const selection = createMemo((): Selection<Formula> | undefined => {
    const found = detail()
    const kept = found?.ok === true ? favorites.keptAmong(found.value.formulas.map((listing) => listing.formula.id)) : undefined
    if (found?.ok !== true || kept === undefined || found.value.machine.id !== machineId()) return undefined
    const byHand = formulaId()
    return (byHand === undefined ? undefined : selectById(found.value.formulas, byHand)) ?? autoSelect(found.value.formulas, worthOf, kept)
  })
  const formulas = (): readonly Formula[] => {
    const found = detail()
    return found?.ok === true && found.value.machine.id === machineId() ? found.value.formulas.map((listing) => listing.formula) : []
  }
  const chosenMachineLabel = (): string | undefined => machines().find((machine) => machine.id === machineId())?.name
  const machineTypedOnly = (): boolean => holdsTypedOnly(machineTyped(), chosenMachineLabel())
  const unwritable = (): boolean => !isWritableText(cabinetNumber())
  /** The machine the play is put on, where it is another than it is on, or the same one weighed by another formula; none where nothing of it changed. */
  const machineChange = (): MachineChange | undefined => {
    const found = detail()
    const formula = selection()?.listing.formula
    const before = props.draft.pachislot
    if (found?.ok !== true || formula === undefined || formula.id === before?.formula.id) return undefined
    const kept = favorites.keptAmong(found.value.distributions.map((listing) => listing.formula.id))
    const prior = before !== undefined && before.formula.machineId === found.value.machine.id ? before.prior : kept === undefined ? undefined : selectPrior(found.value.distributions, undefined, kept).prior
    const read = parsePlayLog(props.draft.log)
    return prior === undefined ? undefined : { type: "pachislot", name: bookNameOf(found.value.machine), weighing: { formula: snapshotOf(formula), prior }, readings: read.ok ? readableBy(snapshotOf(formula), read.value) : undefined }
  }
  /** A machine chosen whose formula is not yet known: its formulas are still being read, or it has none to weigh a play by. */
  const waitingOnFormula = (): boolean => machineId() !== undefined && selection() === undefined
  /** The chosen formula's id and name, put on the clipboard for passing on. */
  const copySelected = async (): Promise<void> => {
    const formula = selection()?.listing.formula
    if (formula === undefined) return
    const handle = formulaHandle(formula)
    const copied = await copyText(handle)
    toast(copied.ok ? { title: "算出条件のIDと名前をコピーしました", description: handle } : { title: "コピーできませんでした", tone: "error" })
  }
  const openSelected = (): void => {
    const formula = selection()?.listing.formula
    if (formula !== undefined) moves.go({ kind: "pachislot-formula", machineId: formula.machineId, formulaId: formula.id })
  }
  const save = async (): Promise<void> => {
    settleTyping()
    if (saving().type === "keeping") return
    if (unwritable() || machineTypedOnly() || waitingOnFormula()) {
      nudge.nudge()
      return
    }
    setSaving({ type: "keeping" })
    const changed = await changeCabinet(app.services.drafts, props.draft, { cabinetNumber: cabinetNumber().trim() === "" ? undefined : cabinetNumber().trim(), machine: machineChange() })
    if (!changed.ok) {
      setSaving({ type: "failed", error: changed.error })
      return
    }
    start.update({ cabinet: undefined })
    toast({ title: "保存しました", stays: "glance" })
    app.wrote()
    moves.go({ kind: "live-play", playId: props.draft.id })
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="台・機種の変更" />}>
      <form
        autocomplete="off"
        class="flex max-w-5xl flex-col gap-5 p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <section class="flex flex-col gap-4" aria-labelledby="cabinet-machine">
          <div class="flex items-center justify-between gap-2 border-b border-border pb-1">
            <h2 id="cabinet-machine" class="text-sm font-bold text-text-primary">
              機種設定
            </h2>
            <PencilledBubble text={`${cabinetNumber().trim() === "" ? "---" : cabinetNumber().trim()}番台`} says="台番号を入力する" invalid={unwritable()}>
              <TextField label="台番号" value={cabinetNumber()} onChange={(typed) => choose({ cabinetNumber: typed })} inputMode="numeric" error={unwritable() ? "「,」「;」や改行は使えません。" : undefined} onFocus={nudge.settle} compact />
            </PencilledBubble>
          </div>
          <div class="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 sm:gap-2">
            <Combobox
              label="機種"
              placeholder={props.draft.machine === "" ? "機種選択" : shownNameOf(app.machineNames(), props.draft.machine)}
              options={machines().map((machine) => ({ value: machine.id, label: machine.name, ...(machine.modelName === undefined ? {} : { note: machine.modelName }) }))}
              value={machineId()}
              onChange={(id) => {
                if (id !== undefined && id !== machineId()) choose({ machineId: id, formulaId: undefined })
              }}
              matches={(id, typed) => ((machine) => machine !== undefined && machineMatches(machine, typed))(machines().find((candidate) => candidate.id === id))}
              invalid={nudge.red() && machineTypedOnly()}
              onFocus={nudge.settle}
              onTyped={setMachineTyped}
            />
            <div class="flex min-w-0 flex-col gap-1.5">
              <div class="flex items-end gap-1">
                <div class="min-w-0 flex-1">
                  <Select
                    label="算出条件"
                    placeholder={machineId() === undefined ? "先に機種を選んでください" : "算出条件を選ぶ"}
                    options={formulas().map((formula) => ({ value: formula.id, label: formulaNameAmong(formula, formulas()) }))}
                    value={selection()?.listing.formula.id}
                    onChange={(id) => choose({ formulaId: id })}
                    invalid={nudge.red() && waitingOnFormula()}
                    onFocus={nudge.settle}
                    labelMark={() => (
                      <Show when={selection()} keyed>
                        {(selected) => <ChoiceReason by={selected.by} />}
                      </Show>
                    )}
                  />
                </div>
                <HintedIconButton label="算出条件のIDと名前をコピー" hint="算出条件のIDと名前をコピーできます" ready={selection() !== undefined} onPress={() => void copySelected()}>
                  <CopyIcon />
                </HintedIconButton>
                <HintedIconButton label="算出条件を見る" hint="算出条件の根拠が見れます" ready={selection() !== undefined} onPress={openSelected} semipro>
                  <QuestionIcon />
                </HintedIconButton>
              </div>
              <Show when={machineId() !== undefined && detail()?.ok === true && formulas().length === 0}>
                <p class="text-xs text-text-muted">この機種には算出条件がありません。</p>
              </Show>
            </div>
          </div>
        </section>
        <Show when={machineChange() !== undefined}>
          <p class="text-xs leading-5 text-text-muted">機種や算出条件を変えると、設定の推測と期待値をその内容で計算し直します。数えた小役やボーナスは、変更後の算出条件にある項目だけが残ります。</p>
        </Show>
        <Show when={((current) => (current.type === "failed" ? current.error : undefined))(saving())} keyed>
          {(error) => (
            <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
              {describeError(error)}
            </div>
          )}
        </Show>
        <div class="flex justify-end">
          <Button type="submit">保存</Button>
        </div>
      </form>
    </MainContent>
  )
}
