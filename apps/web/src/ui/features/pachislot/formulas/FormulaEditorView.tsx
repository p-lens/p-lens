import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { dropDraft, keepDraft, keptDraft, loadQuota } from "../../../../application/catalog"
import type { ApplicationError, Outcome } from "../../../../application/errors"
import { addFormula, analyzeBasis, loadFormula, registerMachine } from "../../../../application/pachislot/formulas"
import { bookNameOf, shownNameOf } from "../../../../core/catalog/catalog"
import { readKeywords, readModelName, readName } from "../../../../core/catalog/description"
import type { DraftTarget, FormulaDraft } from "../../../../core/catalog/draft"
import { type RegistrationKind, standingFor } from "../../../../core/catalog/quota"
import { readReleaseDate } from "../../../../core/catalog/release"
import type { MachineId } from "../../../../core/machine/machine"
import type { Formula } from "../../../../core/pachislot/formula"
import { Ok } from "../../../../core/result/result"
import type { NewMachine, NewPachislotFormula } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { createNudge, redText } from "../../../primitives/nudge"
import { Loaded } from "../../../primitives/states"
import { CalculatorIcon, FistIcon } from "../../../primitives/icons"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../primitives/tabs"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { useMoves } from "../../../navigation/moves"
import type { FormulaTab, Place } from "../../../navigation/place"
import { describeDescriptionProblem, describeReleaseDateError, quotaStandingText } from "../../../wording/catalog"
import { describeError } from "../../../wording/errors"
import { useStartForm } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { CopyFromMachine } from "./CopyFromMachine"
import { FiguresTable } from "./FiguresTable"
import { remadeIn } from "./remaking"
import { SamplingRun } from "./SamplingRun"
import { ManualEditor, WorldEditor } from "./WorldEditor"
import {
  type FormProblem,
  type ManualForm,
  type ReadWorld,
  STARTING_MANUAL,
  STARTING_WORLD,
  type WorldForm,
  manualFormOf,
  statesRate,
  readManualForm,
  readWorldForm,
  worldFormOf,
} from "./world-form"

const isTab = (value: string): value is FormulaTab => value === "manual" || value === "basis"

const REASONS: Readonly<Record<FormProblem["reason"], string>> = {
  required: "未入力",
  "not-a-number": "数字ではありません",
  "too-fine": "小数は2桁までです",
  "out-of-range": "範囲外です",
  "no-bonus": "ボーナスが1つもありません",
  "not-whole": "合計が100%ではありません",
}

/** The machine and the formula each sit behind a bar of their own. */
const PART = "flex flex-col gap-5 border-l-2 border-border pl-3"

/** How many problems are listed by name; a fresh 解析値 table would otherwise list every one of its cells. */
const PROBLEMS_SHOWN = 5

function Problems(props: { readonly problems: readonly FormProblem[]; readonly nudged: boolean }): JSX.Element {
  const hidden = (): number => props.problems.length - PROBLEMS_SHOWN
  return (
    <ul class="flex flex-col gap-0.5 text-sm" classList={redText(props.nudged)}>
      <For each={props.problems.slice(0, PROBLEMS_SHOWN)}>{(problem) => <li>{problem.field}: {REASONS[problem.reason]}</li>}</For>
      <Show when={hidden() > 0}>
        <li>ほか {hidden()} 件</li>
      </Show>
    </ul>
  )
}

/** Where an editor starts: from nothing, or from the formula being remade. */
interface Start {
  readonly manual: ManualForm
  readonly world: WorldForm
}

const startFrom = (formula: Formula | undefined): Start =>
  formula === undefined
    ? { manual: STARTING_MANUAL, world: STARTING_WORLD }
    : formula.kind === "manual" || statesRate(formula.basis.spec, formula.basis.conditions)
      ? { manual: manualFormOf(formula.basis.spec, formula.basis.conditions), world: STARTING_WORLD }
      : { manual: STARTING_MANUAL, world: worldFormOf(formula.basis.spec) }

/** The pachislot formula a draft holds, or none where it is the other game's. */
const draftFormula = (draft: FormulaDraft): NewPachislotFormula | undefined => (draft.formula.gameKind === "pachislot" ? draft.formula.formula : undefined)

/** Where an editor starts from a formula that could not be sent: typed in by hand, or worked out from 解析値, as it was. */
const startFromDraft = (formula: NewPachislotFormula): Start =>
  formula.kind === "manual" || statesRate(formula.basis.spec, formula.basis.conditions)
    ? { manual: manualFormOf(formula.basis.spec, formula.basis.conditions), world: STARTING_WORLD }
    : { manual: STARTING_MANUAL, world: worldFormOf(formula.basis.spec) }

function Editor(props: { readonly place: Place & { readonly kind: "pachislot-formula-new" }; readonly start: Start; readonly from: Formula | undefined }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const startForm = useStartForm()
  const pachislot = () => startForm.form().pachislot
  const catalogMachine = (): string | undefined => {
    const machine = pachislot().machine
    return machine.type === "catalog" ? shownNameOf(app.machineNames(), machine.name) : undefined
  }
  const releaseDate = createMemo(() => readReleaseDate(pachislot().newMachineReleasedOn, app.services.today()))
  const releaseDateWording = (): string | undefined => {
    const read = releaseDate()
    return read.ok ? undefined : describeReleaseDateError(read.error)
  }
  const keywords = createMemo(() => readKeywords(pachislot().newMachineKeywords))
  const keywordsWording = (): string | undefined => {
    const read = keywords()
    return read.ok ? undefined : describeDescriptionProblem(read.error)
  }
  const newMachine = (): NewMachine | undefined => {
    const day = releaseDate()
    const words = keywords()
    const name = readName(pachislot().newMachineName)
    return name === "" || !day.ok || !words.ok ? undefined : { name, modelName: readModelName(pachislot().newMachineModelName), keywords: words.value, hitChance: undefined, releasedOn: day.value }
  }
  const [manual, setManual] = createSignal(props.start.manual)
  const [world, setWorld] = createSignal(props.start.world)
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const [saving, setSaving] = createSignal(false)
  /** What saving here registers, and where this device stands against its quota: asked once the editor opens, and again after a save is refused. */
  const registrationKind = (): RegistrationKind => (pachislot().machine.type === "catalog" ? "addition" : "machine")
  const [quota, { refetch: askQuotaAgain }] = createResource(() => loadQuota(app.services.catalog))
  const standing = createMemo(() => {
    const asked = quota()
    return asked?.ok === true ? standingFor(asked.value, registrationKind()) : undefined
  })
  /** Whether the last save was refused for the quota: its words already say from when the next is taken, so the standing is not said beside them. */
  const refusedForNow = (): boolean => {
    const error = failure()
    return error?.type === "catalog" && error.error.type === "quota-reached"
  }
  /** What the formula on screen is for, as a draft keeps it: the machine chosen, or the new one as typed. */
  const draftTarget = (): DraftTarget => {
    const machine = pachislot().machine
    return machine.type === "catalog"
      ? { type: "catalog", machineId: machine.machineId, name: machine.name }
      : { type: "new", machine: { name: pachislot().newMachineName, modelName: pachislot().newMachineModelName, keywords: pachislot().newMachineKeywords, hitChance: "", releasedOn: pachislot().newMachineReleasedOn } }
  }
  const nameNudge = createNudge()
  const dateNudge = createNudge()
  const modelNudge = createNudge()
  const figuresNudge = createNudge()
  const read = createMemo((): ReturnType<typeof readWorldForm> => (props.place.tab === "manual" ? readManualForm(manual()) : readWorldForm(world())))
  const problems = (): readonly FormProblem[] => {
    const current = read()
    return current.ok ? [] : current.error
  }
  const [analyzed] = createResource(
    () => {
      const current = read()
      return current.ok ? current.value : undefined
    },
    (made: ReadWorld) => analyzeBasis(app.services.pachislot, made.spec, made.conditions),
  )

  /** The formula the tab on screen would make, or undefined while it cannot make one. */
  const proposed = (): NewPachislotFormula | undefined => {
    const made = analyzed()
    if (read().ok !== true || made?.ok !== true) return undefined
    const derivedFrom = props.from?.id
    return { kind: props.place.tab === "manual" ? "manual" : "simulated", figures: made.value.figures, basis: made.value.basis, derivedFrom }
  }

  /** Where a formula is shared: added to the machine chosen, or registered with a new one — or nowhere yet, if the new one is not filled in. */
  type Saved = Outcome<{ readonly machineId: MachineId; readonly name: string; readonly formulaId: string }>
  const saveTo = async (formula: NewPachislotFormula): Promise<Saved | undefined> => {
    const machine = pachislot().machine
    if (machine.type === "catalog")
      return addFormula(app.services.catalog, machine.machineId, formula).then((done) =>
        done.ok ? Ok({ machineId: machine.machineId, name: machine.name, formulaId: done.value.id }) : done,
      )
    const registering = newMachine()
    if (registering === undefined) return undefined
    return registerMachine(app.services.catalog, registering, formula).then((done) =>
      done.ok ? Ok({ machineId: done.value.machineId, name: bookNameOf(registering), formulaId: done.value.id }) : done,
    )
  }

  const nudgeWhatIsMissing = (): boolean => {
    const registering = pachislot().machine.type === "none"
    const nameMissing = registering && pachislot().newMachineName.trim() === ""
    const dateMissing = registering && !releaseDate().ok
    const modelMissing = registering && readModelName(pachislot().newMachineModelName) === undefined
    const descriptionWrong = registering && !keywords().ok
    const figuresMissing = proposed() === undefined
    if (nameMissing) nameNudge.nudge()
    if (dateMissing) dateNudge.nudge()
    if (modelMissing) modelNudge.nudge()
    if (figuresMissing) figuresNudge.nudge()
    return nameMissing || dateMissing || modelMissing || descriptionWrong || figuresMissing
  }

  const save = async (): Promise<void> => {
    settleTyping()
    if (saving() || nudgeWhatIsMissing()) return
    const formula = proposed()
    if (formula === undefined) return
    setSaving(true)
    const saved = await saveTo(formula)
    setSaving(false)
    if (saved === undefined) return
    if (!saved.ok) {
      keepDraft(app.services.preferences, { target: draftTarget(), formula: { gameKind: "pachislot", formula } })
      setFailure(saved.error)
      void askQuotaAgain()
      return
    }
    dropDraft(app.services.preferences, "pachislot")
    app.delivery.awaitShared()
    startForm.updatePachislot({
      machine: { type: "catalog", machineId: saved.value.machineId, name: saved.value.name },
      formulaId: saved.value.formulaId as Formula["id"],
      remakeFrom: undefined,
      newMachineName: "",
      newMachineModelName: "",
      newMachineKeywords: "",
      newMachineReleasedOn: "",
    })
    moves.go({ kind: "pachislot-machine", machineId: saved.value.machineId })
  }

  const Preview = (): JSX.Element => (
    <Show when={read().ok} fallback={<Problems problems={problems()} nudged={figuresNudge.red()} />}>
      <Loaded outcome={analyzed()}>
        {(made) => (
          <>
            <FiguresTable figures={made.figures} sampling={undefined} />
            <Show when={props.place.tab === "basis"}>
              <section aria-label="確認用シミュレーション" class="flex flex-col gap-2">
                <p class="text-sm text-text-muted">確認用：同じ解析値でこの端末がゲームを回して、上の機械割を推定で確かめます。算出条件にはなりません。</p>
                <SamplingRun basis={made.basis} settingLevels={made.figures.length} />
              </section>
            </Show>
          </>
        )}
      </Loaded>
    </Show>
  )

  return (
    <Tabs
      value={props.place.tab}
      onChange={(value) => {
        if (isTab(value)) moves.refine({ kind: "pachislot-formula-new", tab: value }, "")
      }}
      label="作り方"
    >
      <TabsList>
        <TabsTrigger value="manual" icon={<FistIcon />}>
          手入力
        </TabsTrigger>
        <TabsTrigger value="basis" icon={<CalculatorIcon />}>
          解析値から計算
        </TabsTrigger>
      </TabsList>
      <div class="flex flex-col gap-5 p-4">
        <section aria-label="機種" class={PART}>
          <Show
            when={catalogMachine()}
            keyed
            fallback={
              <div class="flex max-w-md flex-col gap-2">
                <div class="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
                  <TextField
                    label="機種名"
                    placeholder="ホールでの呼び名"
                    value={pachislot().newMachineName}
                    onChange={(newMachineName) => startForm.updatePachislot({ newMachineName })}
                    tidied={readName}
                    required
                    invalid={nameNudge.red()}
                    onFocus={nameNudge.settle}
                  />
                  <TextField
                    label="導入日"
                    type="date"
                    value={pachislot().newMachineReleasedOn}
                    onChange={(newMachineReleasedOn) => startForm.updatePachislot({ newMachineReleasedOn })}
                    required
                    invalid={dateNudge.red()}
                    error={releaseDateWording()}
                    onFocus={dateNudge.settle}
                  />
                </div>
                <TextField
                  label="型式名"
                  value={pachislot().newMachineModelName}
                  onChange={(newMachineModelName) => startForm.updatePachislot({ newMachineModelName })}
                  tidied={readName}
                  required
                  invalid={modelNudge.red()}
                  onFocus={modelNudge.settle}
                />
                <TextField
                  label="検索ワード（任意）"
                  value={pachislot().newMachineKeywords}
                  onChange={(newMachineKeywords) => startForm.updatePachislot({ newMachineKeywords })}
                  placeholder="略称やよみを「、」で区切って"
                  invalid={!keywords().ok}
                  error={keywordsWording()}
                />
              </div>
            }
          >
            {(name) => (
              <p class="text-sm text-text-secondary">
                機種: <span class="font-semibold text-text-primary">{name}</span>
              </p>
            )}
          </Show>
        </section>
        <section aria-label="算出条件" class={PART}>
          <TabsContent value="manual" class="flex flex-col gap-5">
            <p class="text-sm text-text-muted">メーカー公表や解析サイトの、設定ごとのボーナス確率と機械割をそのまま入れます。</p>
            <ManualEditor form={manual()} onChange={setManual} />
            <Preview />
          </TabsContent>
          <TabsContent value="basis" class="flex flex-col gap-5">
            <p class="text-sm text-text-muted">解析値（ボーナス・小役・リプレイの確率と払い出し）を入れると、計算エンジンが設定ごとの機械割を厳密に出します。</p>
            <WorldEditor form={world()} onChange={setWorld} />
            <Preview />
          </TabsContent>
        </section>
        <Show when={failure()} keyed>
          {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
        </Show>
        <Show when={refusedForNow() ? undefined : standing()} keyed>
          {(where) => <p class="text-xs text-text-muted">{quotaStandingText(registrationKind(), where)}</p>}
        </Show>
        <div>
          <Button variant="semipro" onClick={() => void save()}>{pachislot().machine.type === "catalog" ? "この算出条件を追加する" : "機種と算出条件を登録する"}</Button>
        </div>
      </div>
    </Tabs>
  )
}

/**
 * Making a pachislot formula: typed in from published figures, worked out
 * exactly from 解析値, or sampled from them on the device. For a machine not
 * yet in the catalog, the machine is registered with it, in one step.
 */
export function FormulaEditorView(props: { readonly place: Place & { readonly kind: "pachislot-formula-new" } }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const startForm = useStartForm()
  const machineId = createMemo((): string | undefined => {
    const machine = startForm.form().pachislot.machine
    return machine.type === "catalog" ? machine.machineId : undefined
  })
  const remakeFrom = createMemo(() => startForm.form().pachislot.remakeFrom)
  const [from] = createResource(
    () => ({ machineId: machineId(), remakeFrom: remakeFrom() }),
    async (source): Promise<Outcome<Formula | undefined>> => {
      if (source.machineId === undefined || source.remakeFrom === undefined) return Ok(undefined)
      const found = await loadFormula(app.services.catalog, source.machineId, source.remakeFrom)
      return found.ok ? Ok(found.value.listing.formula) : found
    },
  )
  /** The machine as a value of its own, so the trail stands while the rest of the form is typed into. */
  const machine = createMemo(() => startForm.form().pachislot.machine)
  const trail = createMemo(() => {
    const chosen = machine()
    return [
      { label: "スロット開始", onSelect: () => moves.go({ kind: "live-new", game: "slot" }) },
      chosen.type === "catalog" ? { label: shownNameOf(app.machineNames(), chosen.name), onSelect: () => moves.go({ kind: "pachislot-machine", machineId: chosen.machineId }) } : { label: "新しい機種" },
      { label: "算出条件を作る" },
    ]
  })
  /** A formula that could not be sent last time, offered back unless one is being remade; and the editor's start once it is taken back. */
  const [draft, setDraft] = createSignal(keptDraft(app.services.preferences, "pachislot"))
  const [restored, setRestored] = createSignal<Start | undefined>(undefined)
  const restore = (kept: FormulaDraft): void => {
    const formula = draftFormula(kept)
    if (formula === undefined) return
    startForm.updatePachislot(
      kept.target.type === "catalog"
        ? { machine: { type: "catalog", machineId: kept.target.machineId, name: kept.target.name }, remakeFrom: undefined }
        : {
            machine: { type: "none" },
            remakeFrom: undefined,
            newMachineName: kept.target.machine.name,
            newMachineModelName: kept.target.machine.modelName,
            newMachineKeywords: kept.target.machine.keywords,
            newMachineReleasedOn: kept.target.machine.releasedOn,
          },
    )
    setRestored(startFromDraft(formula))
    setDraft({ type: "none" })
  }
  const discard = (): void => {
    dropDraft(app.services.preferences, "pachislot")
    setDraft({ type: "none" })
  }
  /** Starts the editor over from another machine's formula, in the tab it was made in: what is typed after is this machine's own, derived from none. */
  const copy = (formula: Formula, from: string): void => {
    setRestored(startFrom(formula))
    moves.go({ kind: "pachislot-formula-new", tab: remadeIn(formula) })
    toast({ title: `「${from}」の算出条件を入れました`, description: "機種名やリリース日はそのままです。数値を直して登録してください。" })
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="算出条件を作る" trail={trail()} />}>
      <div class="flex max-w-5xl flex-col gap-3">
        <Show when={((found) => (found.type === "kept" ? found.draft : undefined))(draft())} keyed>
          {(kept) => (
            <div class="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="text-text-secondary">未送信の入力があります</span>
                <span class="truncate text-xs text-text-muted">{kept.target.type === "catalog" ? kept.target.name : kept.target.machine.name}</span>
              </div>
              <Button variant="outline" size="small" onClick={() => restore(kept)}>
                戻す
              </Button>
              <Button variant="ghost" size="small" onClick={discard}>
                捨てる
              </Button>
            </div>
          )}
        </Show>
        <Show when={draft().type === "unreadable"}>
          <div role="alert" class="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-negative/40 px-3 py-2 text-sm">
            <span class="min-w-0 flex-1 text-text-secondary">未送信の入力が壊れていて読めません</span>
            <Button variant="ghost" size="small" onClick={discard}>
              捨てる
            </Button>
          </div>
        </Show>
        <Show when={machine().type === "none"}>
          <div class="px-4 pt-3">
            <CopyFromMachine onCopied={copy} />
          </div>
        </Show>
        <Loaded outcome={from()}>
          {(formula) => (
            <Show when={[restored()]} keyed>
              {([start]) => <Editor place={props.place} start={start ?? startFrom(formula)} from={formula} />}
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
