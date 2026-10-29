import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { dropDraft, keepDraft, keptDraft, loadQuota } from "../../../../application/catalog"
import type { ApplicationError, Outcome } from "../../../../application/errors"
import { addFormula, loadFormula, registerMachine, analyzeBasis } from "../../../../application/pachinko/formulas"
import { bonusNamesOf, bonusShapes, namedBonuses } from "../../../../core/pachinko/bonuses"
import { basisOf, type Formula, type FormulaMaking } from "../../../../core/pachinko/formula"
import { type Figures } from "../../../../core/pachinko/figures"
import { type BonusRow, EMPTY_BONUS_ROW, readBonuses } from "../../../../core/catalog/bonuses"
import type { DraftTarget, FormulaDraft } from "../../../../core/catalog/draft"
import { type RegistrationKind, standingFor } from "../../../../core/catalog/quota"
import { readHitChance, readKeywords, readModelName, readName } from "../../../../core/catalog/description"
import { readReleaseDate } from "../../../../core/catalog/release"
import { Ok } from "../../../../core/result/result"
import { bookNameOf, shownNameOf, type MachineBonus, type NewMachine, type NewPachinkoFormula } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { createNudge, redText } from "../../../primitives/nudge"
import { Loaded } from "../../../primitives/states"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { CalculatorIcon, FistIcon } from "../../../primitives/icons"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../primitives/tabs"
import { toast } from "../../../primitives/toast"
import { useMoves } from "../../../navigation/moves"
import type { FormulaTab, Place } from "../../../navigation/place"
import { describeDescriptionProblem, describeReleaseDateError, quotaStandingText, REGISTER_OFFLINE, REGISTRATION_SENDING } from "../../../wording/catalog"
import { isUnreached } from "../../catalog/unreached"
import { describeError } from "../../../wording/errors"
import { oneInText, payoutText } from "../../../wording/pachinko/formula"
import { useStartForm } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { BasisEditor } from "./BasisEditor"
import { BonusNames } from "./BonusNames"
import { BonusRows } from "./BonusRows"
import { CopyFromMachine } from "./CopyFromMachine"
import { remadeIn } from "./remaking"
import { SamplingRun } from "./SamplingRun"
import {
  type BasisForm,
  EMPTY_MANUAL_FORM,
  type FormProblem,
  type ManualForm,
  STARTING_BASIS,
  basisFormOf,
  manualFormOf,
  readBasisForm,
  readManualForm,
} from "./formula-form"

const isTab = (value: string | null): value is FormulaTab => value === "manual" || value === "basis"

const REASONS: Readonly<Record<FormProblem["reason"], string>> = {
  required: "未入力",
  "not-a-number": "数字ではありません",
  "too-fine": "小数は2桁までです",
  "not-whole": "整数で入れてください",
  "out-of-range": "範囲外です",
}

/** The machine and the formula each sit behind a bar of their own, so it is plain which fields are which without saying so. */
const PART = "flex flex-col gap-5 border-l-2 border-border pl-3"

/** What stops a formula being made, in the warning colour; red for a while after a save that it stopped. */
function Problems(props: { readonly problems: readonly FormProblem[]; readonly nudged: boolean }): JSX.Element {
  return (
    <ul class="flex flex-col gap-0.5 text-sm" classList={redText(props.nudged)}>
      <For each={props.problems}>{(problem) => <li>{problem.field}: {REASONS[problem.reason]}</li>}</For>
    </ul>
  )
}

function FiguresPreview(props: { readonly figures: Figures }): JSX.Element {
  return (
    <dl class="grid grid-cols-2 gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm sm:grid-cols-3">
      <div><dt class="text-xs text-text-muted">1Rトータル確率</dt><dd class="text-lg font-bold tabular-nums">{oneInText(props.figures.roundChanceOneIn)}</dd></div>
      <div><dt class="text-xs text-text-muted">1R平均出玉</dt><dd class="text-lg font-bold tabular-nums">{payoutText(props.figures.payoutPerRound)}</dd></div>
      <Show when={props.figures.totalChanceOneIn} keyed>
        {(total) => <div><dt class="text-xs text-text-muted">トータル確率</dt><dd class="text-lg font-bold tabular-nums">{oneInText(total)}</dd></div>}
      </Show>
    </dl>
  )
}

/** Where an editor starts: from nothing, or from the formula being remade. */
interface Start {
  readonly manual: ManualForm
  readonly basis: BasisForm
  /** A typed-in formula's bonuses, a row each. */
  readonly bonusRows: readonly BonusRow[]
  /** The names typed for a basis's bonuses, each under its rounds. */
  readonly bonusNames: Readonly<Record<string, string>>
}

/** A formula's bonuses as rows to type over, an empty one where it has none. */
const rowsOf = (bonuses: readonly MachineBonus[]): readonly BonusRow[] =>
  bonuses.length === 0 ? [EMPTY_BONUS_ROW] : bonuses.map((bonus) => ({ name: bonus.name, payout: String(bonus.payout), spent: String(bonus.spent), jackpots: bonus.jackpots === undefined ? "" : String(bonus.jackpots) }))

/** What a formula being made again states of its bonuses, as it is typed again: one with a basis its names, one typed in its rows. */
const bonusesFrom = (made: (FormulaMaking & { readonly bonuses: readonly MachineBonus[] }) | undefined): Pick<Start, "bonusRows" | "bonusNames"> => {
  if (made === undefined) return { bonusRows: [EMPTY_BONUS_ROW], bonusNames: {} }
  return made.kind === "manual" ? { bonusRows: rowsOf(made.bonuses), bonusNames: {} } : { bonusRows: [EMPTY_BONUS_ROW], bonusNames: bonusNamesOf(made.basis.spec, made.bonuses) }
}

/** The basis form a formula is remade from: its own basis, or a fresh one when it has none. */
const startingBasis = (formula: Formula | undefined): BasisForm => {
  const basis = formula === undefined ? undefined : basisOf(formula)
  return basis === undefined ? STARTING_BASIS : basisFormOf(basis.spec, basis.conditions, formula?.figures.spinsPerHour)
}

const startFrom = (formula: Formula | undefined): Start => ({
  manual: formula === undefined ? EMPTY_MANUAL_FORM : manualFormOf(formula.figures),
  basis: startingBasis(formula),
  ...bonusesFrom(formula),
})

/** The pachinko formula a draft holds, or none where it is the other game's. */
const draftFormula = (draft: FormulaDraft): NewPachinkoFormula | undefined => (draft.formula.gameKind === "pachinko" ? draft.formula.formula : undefined)

/** Where an editor starts from a formula that could not be sent: the figures it had, and its basis where it was worked out from one. */
const startFromDraft = (formula: NewPachinkoFormula): Start => ({
  manual: manualFormOf(formula.figures),
  basis: formula.kind === "manual" ? STARTING_BASIS : basisFormOf(formula.basis.spec, formula.basis.conditions, formula.figures.spinsPerHour),
  ...bonusesFrom(formula),
})

/** A formula as its tab makes it, before its bonuses are stated. */
type Unstated<F> = F extends unknown ? Omit<F, "bonuses"> : never

function Editor(props: { readonly place: Place & { readonly kind: "pachinko-formula-new" }; readonly start: Start; readonly from: Formula | undefined }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const startForm = useStartForm()
  const target = () => startForm.form().pachinko.machine
  const catalogMachine = (): string | undefined => {
    const machine = target()
    return machine.type === "catalog" ? shownNameOf(app.machineNames(), machine.name) : undefined
  }
  const basisProblems = (): readonly FormProblem[] => {
    const read = basisRead()
    return read.ok ? [] : read.error
  }
  const manualProblems = (): readonly FormProblem[] => {
    const read = manualRead()
    return read.ok ? [] : read.error
  }
  /** The new machine's name and date live in the start form, so switching tabs keeps them. */
  const machineName = (): string => startForm.form().pachinko.newMachineName
  const setMachineName = (newMachineName: string): void => startForm.updatePachinko({ newMachineName })
  const releasedOn = (): string => startForm.form().pachinko.newMachineReleasedOn
  const setReleasedOn = (newMachineReleasedOn: string): void => startForm.updatePachinko({ newMachineReleasedOn })
  const releaseDate = createMemo(() => readReleaseDate(releasedOn(), app.services.today()))
  const releaseDateWording = (): string | undefined => {
    const read = releaseDate()
    return read.ok ? undefined : describeReleaseDateError(read.error)
  }
  const modelName = (): string => startForm.form().pachinko.newMachineModelName
  const keywordsTyped = (): string => startForm.form().pachinko.newMachineKeywords
  const hitChanceTyped = (): string => startForm.form().pachinko.newMachineHitChance
  const keywords = createMemo(() => readKeywords(keywordsTyped()))
  const hitChance = createMemo(() => readHitChance(hitChanceTyped()))
  const keywordsWording = (): string | undefined => {
    const read = keywords()
    return read.ok ? undefined : describeDescriptionProblem(read.error)
  }
  const hitChanceWording = (): string | undefined => {
    const read = hitChance()
    return read.ok ? undefined : describeDescriptionProblem(read.error)
  }
  /** A new machine as typed, once it has a name and a release date and nothing typed beside them is wrong; undefined until then. */
  const newMachine = (): NewMachine | undefined => {
    const day = releaseDate()
    const words = keywords()
    const chance = hitChance()
    return machineName().trim() === "" || !day.ok || !words.ok || !chance.ok
      ? undefined
      : { name: readName(machineName()), modelName: readModelName(modelName()), keywords: words.value, hitChance: chance.value, releasedOn: day.value }
  }
  const [manual, setManual] = createSignal(props.start.manual)
  const [basis, setBasis] = createSignal(props.start.basis)
  const [bonusRows, setBonusRows] = createSignal(props.start.bonusRows)
  const [bonusNames, setBonusNames] = createSignal(props.start.bonusNames)
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  /** Whether the formula is on its way to the shared catalog: its button is still until the answer comes. */
  const [saving, setSaving] = createSignal<"editing" | "sending">("editing")
  /** What saving here registers, and where this device stands against its quota: asked once the editor opens, and again after a save is refused. */
  const registrationKind = (): RegistrationKind => (target().type === "catalog" ? "addition" : "machine")
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
    const machine = target()
    return machine.type === "catalog"
      ? machine
      : { type: "new", machine: { name: machineName(), modelName: modelName(), keywords: keywordsTyped(), hitChance: hitChanceTyped(), releasedOn: releasedOn() } }
  }
  const nameNudge = createNudge()
  const dateNudge = createNudge()
  const modelNudge = createNudge()
  const chanceNudge = createNudge()
  const bonusNudge = createNudge()
  const figuresNudge = createNudge()
  const figureNudged = (field: string): boolean => figuresNudge.red() && manualProblems().some((problem) => problem.field === field)
  const manualRead = createMemo(() => readManualForm(manual()))
  const basisRead = createMemo(() => readBasisForm(basis()))
  const [simulated] = createResource(
    () => {
      const read = basisRead()
      return props.place.tab !== "manual" && read.ok ? read.value : undefined
    },
    (read) => analyzeBasis(app.services.pachinko, read.spec, read.conditions, read.spinsPerHour),
  )

  /** The bonuses the basis on screen's jackpots pay, to be named; none while it does not read. */
  const shapes = createMemo(() => {
    const read = basisRead()
    return read.ok ? bonusShapes(read.value.spec) : []
  })
  const typedBonuses = createMemo(() => readBonuses(bonusRows()))
  const named = createMemo(() => namedBonuses(shapes(), bonusNames()))
  /** The bonuses the tab on screen states: a typed-in formula's own rows, at least one, or the basis's under their names. None while they do not read. */
  const stated = (): readonly MachineBonus[] | undefined => {
    if (props.place.tab !== "manual") return ((read) => (read.ok ? read.value : undefined))(named())
    const typed = typedBonuses()
    return typed.ok && typed.value.length > 0 ? typed.value : undefined
  }

  /** The formula the tab on screen would make before its bonuses are stated, or undefined while it cannot make one. */
  const unstated = (): Unstated<NewPachinkoFormula> | undefined => {
    if (props.place.tab === "manual") {
      const read = manualRead()
      return read.ok ? { kind: "manual", figures: read.value, derivedFrom: props.from?.id } : undefined
    }
    const made = simulated()
    return made?.ok === true ? { kind: "simulated", figures: made.value.figures, basis: made.value.basis, derivedFrom: props.from?.id } : undefined
  }

  /** The formula the tab on screen would make, or undefined while it cannot make one. */
  const proposed = (): NewPachinkoFormula | undefined => {
    const made = unstated()
    const bonuses = stated()
    return made === undefined || bonuses === undefined ? undefined : { ...made, bonuses }
  }

  /**
   * Where a formula is shared: added to the machine chosen, or registered
   * with a new one — or nowhere yet, if the new one is not filled in.
   */
  type Saved = Outcome<{ readonly machineId: Formula["machineId"]; readonly name: string; readonly formulaId: string }>
  const saveTo = async (formula: NewPachinkoFormula): Promise<Saved | undefined> => {
    const machine = target()
    if (machine.type === "catalog")
      return addFormula(app.services.catalog, machine.machineId, formula).then((done) => (done.ok ? Ok({ machineId: machine.machineId, name: machine.name, formulaId: done.value.id }) : done))
    const registering = newMachine()
    if (registering === undefined) return undefined
    return registerMachine(app.services.catalog, registering, formula).then((done) =>
      done.ok ? Ok({ machineId: done.value.machineId, name: bookNameOf(registering), formulaId: done.value.id }) : done,
    )
  }

  /** Nudges whatever a save is waiting on, and says whether there was anything. */
  const nudgeWhatIsMissing = (): boolean => {
    const registering = target().type === "none"
    const nameMissing = registering && machineName().trim() === ""
    const dateMissing = registering && !releaseDate().ok
    const modelMissing = registering && readModelName(modelName()) === undefined
    const chanceMissing = registering && hitChanceTyped().trim() === ""
    const descriptionWrong = registering && (!keywords().ok || !hitChance().ok)
    const figuresMissing = unstated() === undefined
    const bonusesMissing = stated() === undefined
    if (nameMissing) nameNudge.nudge()
    if (dateMissing) dateNudge.nudge()
    if (modelMissing) modelNudge.nudge()
    if (chanceMissing) chanceNudge.nudge()
    if (figuresMissing) figuresNudge.nudge()
    if (bonusesMissing) bonusNudge.nudge()
    return nameMissing || dateMissing || modelMissing || chanceMissing || descriptionWrong || figuresMissing || bonusesMissing
  }

  const save = async (): Promise<void> => {
    settleTyping()
    if (saving() === "sending" || nudgeWhatIsMissing()) return
    const formula = proposed()
    if (formula === undefined) return
    setFailure(undefined)
    setSaving("sending")
    const saved = await saveTo(formula)
    setSaving("editing")
    if (saved === undefined) return
    if (!saved.ok) {
      keepDraft(app.services.preferences, { target: draftTarget(), formula: { gameKind: "pachinko", formula } })
      setFailure(saved.error)
      void askQuotaAgain()
      return
    }
    dropDraft(app.services.preferences, "pachinko")
    app.delivery.awaitShared()
    startForm.updatePachinko({
      machine: { type: "catalog", machineId: saved.value.machineId, name: saved.value.name },
      formulaId: saved.value.formulaId as Formula["id"],
      remakeFrom: undefined,
      newMachineName: "",
      newMachineModelName: "",
      newMachineKeywords: "",
      newMachineHitChance: "",
      newMachineReleasedOn: "",
    })
    moves.go({ kind: "live-new", game: "pachinko" })
  }

  return (
    <Tabs
      value={props.place.tab}
      onChange={(value) => {
        if (isTab(value)) moves.refine({ kind: "pachinko-formula-new", tab: value }, "")
      }}
      label="作り方"
    >
      <TabsList>
        <TabsTrigger value="manual" icon={<FistIcon />}>
          手入力
        </TabsTrigger>
        <TabsTrigger value="basis" icon={<CalculatorIcon />}>
          基礎値から計算
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
                  <TextField label="機種名" value={machineName()} onChange={setMachineName} placeholder="ホールでの呼び名" tidied={readName} required invalid={nameNudge.red()} onFocus={nameNudge.settle} />
                  <TextField label="リリース日" type="date" value={releasedOn()} onChange={setReleasedOn} required invalid={dateNudge.red()} error={releaseDateWording()} onFocus={dateNudge.settle} />
                </div>
                <div class="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
                  <TextField label="型式名" value={modelName()} onChange={(newMachineModelName) => startForm.updatePachinko({ newMachineModelName })} tidied={readName} required invalid={modelNudge.red()} onFocus={modelNudge.settle} />
                  <TextField
                    label="大当り確率"
                    value={hitChanceTyped()}
                    onChange={(newMachineHitChance) => startForm.updatePachinko({ newMachineHitChance })}
                    placeholder="1/319.7"
                    required
                    invalid={!hitChance().ok || chanceNudge.red()}
                    error={hitChanceWording()}
                    onFocus={chanceNudge.settle}
                  />
                </div>
                <TextField
                  label="検索ワード（任意）"
                  value={keywordsTyped()}
                  onChange={(newMachineKeywords) => startForm.updatePachinko({ newMachineKeywords })}
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
            <div class="grid max-w-xl grid-cols-2 gap-3">
              <TextField label="1Rトータル確率 1/" value={manual().roundChanceOneIn} onChange={(value) => setManual({ ...manual(), roundChanceOneIn: value })} inputMode="decimal" invalid={figureNudged("1Rトータル確率")} onFocus={figuresNudge.settle} />
              <TextField label="1R平均出玉" value={manual().payoutPerRound} onChange={(value) => setManual({ ...manual(), payoutPerRound: value })} inputMode="decimal" suffix="玉" invalid={figureNudged("1R平均出玉")} onFocus={figuresNudge.settle} />
              <TextField label="トータル確率 1/（任意）" value={manual().totalChanceOneIn} onChange={(value) => setManual({ ...manual(), totalChanceOneIn: value })} inputMode="decimal" invalid={figureNudged("トータル確率")} onFocus={figuresNudge.settle} />
              <TextField label="1時間の回転数（任意）" value={manual().spinsPerHour} onChange={(value) => setManual({ ...manual(), spinsPerHour: value })} inputMode="numeric" invalid={figureNudged("1時間の回転数")} onFocus={figuresNudge.settle} />
            </div>
            <Problems problems={manualProblems()} nudged={figuresNudge.red()} />
            <div class="max-w-md">
              <BonusRows
                rows={bonusRows()}
                problems={((read) => (read.ok ? [] : read.error))(typedBonuses())}
                wanting={bonusNudge.red() && typedBonuses().ok}
                onFocus={bonusNudge.settle}
                onChange={setBonusRows}
              />
            </div>
          </TabsContent>
          <TabsContent value="basis" class="flex flex-col gap-5">
            <p class="text-sm text-text-muted">スペックの値（期待値基礎値）を入れると、計算エンジンが 1Rトータル確率と 1R平均出玉を厳密に出します。</p>
            <BasisEditor form={basis()} onChange={setBasis} />
            <Show when={basisRead().ok} fallback={<Problems problems={basisProblems()} nudged={figuresNudge.red()} />}>
              <Loaded outcome={simulated()}>
                {(made) => (
                  <>
                    <FiguresPreview figures={made.figures} />
                    <section aria-label="確認用シミュレーション" class="flex flex-col gap-2">
                      <p class="text-sm text-text-muted">確認用：同じ基礎値でこの端末がモンテカルロを回して、上の 1Rトータル確率を推定で確かめます。算出条件にはなりません。</p>
                      <SamplingRun basis={made.basis} />
                    </section>
                  </>
                )}
              </Loaded>
              <BonusNames shapes={shapes()} names={bonusNames()} problems={((read) => (read.ok ? [] : read.error))(named())} onChange={setBonusNames} />
            </Show>
          </TabsContent>
        </section>
        <Show when={failure()} keyed>
          {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
        </Show>
        <Show when={refusedForNow() ? undefined : standing()} keyed>
          {(where) => <p class="text-xs text-text-muted">{quotaStandingText(registrationKind(), where)}</p>}
        </Show>
        <Show when={failure() === undefined && isUnreached(quota())}>
          <p class="text-xs text-text-muted">{REGISTER_OFFLINE}</p>
        </Show>
        <div>
          <Button variant="semipro" onClick={() => void save()} aria-busy={saving() === "sending"}>
            {saving() === "sending" ? REGISTRATION_SENDING : target().type === "catalog" ? "この算出条件を追加する" : "機種と算出条件を登録する"}
          </Button>
        </div>
      </div>
    </Tabs>
  )
}

/**
 * Making a formula: by hand from figures checked elsewhere, by solving a
 * basis exactly, or by sampling one on the device. For a machine not yet in the catalog, the machine is registered with
 * it, in one step — never alone.
 */
export function FormulaEditorView(props: { readonly place: Place & { readonly kind: "pachinko-formula-new" } }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const startForm = useStartForm()
  /** The machine and the formula being remade, as values of their own: nothing else in the start form reloads them. */
  const machineId = createMemo((): string | undefined => {
    const machine = startForm.form().pachinko.machine
    return machine.type === "catalog" ? machine.machineId : undefined
  })
  const remakeFrom = createMemo(() => startForm.form().pachinko.remakeFrom)
  const [from] = createResource(
    () => ({ machineId: machineId(), remakeFrom: remakeFrom() }),
    async (source): Promise<Outcome<Formula | undefined>> => {
      if (source.machineId === undefined || source.remakeFrom === undefined) return Ok(undefined)
      const found = await loadFormula(app.services.catalog, source.machineId, source.remakeFrom)
      return found.ok ? Ok(found.value.listing.formula) : found
    },
  )
  /** The machine as a value of its own, so the trail stands while the rest of the form is typed into. */
  const machine = createMemo(() => startForm.form().pachinko.machine)
  const trail = createMemo(() => {
    const chosen = machine()
    return [
      { label: "パチンコ開始", onSelect: () => moves.go({ kind: "live-new", game: "pachinko" }) },
      chosen.type === "catalog" ? { label: shownNameOf(app.machineNames(), chosen.name), onSelect: () => moves.go({ kind: "pachinko-machine", machineId: chosen.machineId }) } : { label: "新しい機種" },
      { label: "算出条件を作る" },
    ]
  })
  /** A formula that could not be sent last time, offered back unless one is being remade; and the editor's start once it is taken back. */
  const [draft, setDraft] = createSignal(keptDraft(app.services.preferences, "pachinko"))
  const [restored, setRestored] = createSignal<Start | undefined>(undefined)
  const restore = (kept: FormulaDraft): void => {
    const formula = draftFormula(kept)
    if (formula === undefined) return
    startForm.updatePachinko(
      kept.target.type === "catalog"
        ? { machine: kept.target, remakeFrom: undefined }
        : {
            machine: { type: "none" },
            remakeFrom: undefined,
            newMachineName: kept.target.machine.name,
            newMachineModelName: kept.target.machine.modelName,
            newMachineKeywords: kept.target.machine.keywords,
            newMachineHitChance: kept.target.machine.hitChance,
            newMachineReleasedOn: kept.target.machine.releasedOn,
          },
    )
    setRestored(startFromDraft(formula))
    setDraft({ type: "none" })
  }
  const discard = (): void => {
    dropDraft(app.services.preferences, "pachinko")
    setDraft({ type: "none" })
  }
  /** Starts the editor over from another machine's formula, in the tab it was made in: what is typed after is this machine's own, derived from none. */
  const copy = (formula: Formula, from: string): void => {
    setRestored(startFrom(formula))
    moves.go({ kind: "pachinko-formula-new", tab: remadeIn(formula) })
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
