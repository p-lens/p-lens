import type { PlayDto } from "@p-lens/contracts/pachinko"
import { createMemo, createResource, createSignal, Match, Show, Switch, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { startPlay } from "../../../../application/live-play"
import { recordUse } from "../../../../application/catalog"
import { loadMachine } from "../../../../application/pachinko/formulas"
import { reliefDriveOf } from "../../../../application/pachinko/hyena-hunt"
import { borderOf } from "../../../../core/pachinko/theoretical-value"
import { basisOf, type Basis, type FormulaId, type Formula, worthOf } from "../../../../core/pachinko/formula"
import { type Figures } from "../../../../core/pachinko/figures"
import { snapshotOf } from "../../../../core/pachinko/snapshot"
import { autoSelect, selectById, type Selection } from "../../../../core/formula/standing"
import type { PlayDraft, PlayVenue } from "../../../../core/live-play/draft"
import { nearestFirst } from "../../../../core/parlor/distance"
import type { ParlorId, ParlorIdentity, SubmissionId } from "../../../../core/parlor/parlor"
import { parlorMatches } from "../../../../core/parlor/search"
import { searchKeyOf } from "../../../../core/text/search-key"
import type { Coordinates, ParlorList, SharedParlor, SharedParlorId } from "../../../../core/parlor/shared"
import { poolOf } from "../../../../core/parlor/terms"
import { appendCheckpoint } from "../../../../core/play-log/checkpoint"
import { isWritableText } from "../../../../core/tally/validate"
import type { Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"
import type { LocateError } from "../../../../location/port/locator"
import { shownNameOf, type MachineBonus, type PachinkoMachineDetail } from "../../../../core/catalog/catalog"
import type { Submission } from "../../../../parlors/port/submission-store"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { copyText } from "../../../primitives/clipboard"
import { Combobox, holdsTypedOnly } from "../../../primitives/combobox"
import { DetailButton } from "../../../primitives/detail-button"
import { CopyIcon, PlusIcon, QuestionIcon } from "../../../primitives/icons"
import { PencilledBubble } from "../../../primitives/pencilled-bubble"
import { HintedIconButton } from "../../../primitives/popover"
import { createNudge, redRing } from "../../../primitives/nudge"
import { Loaded } from "../../../primitives/states"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { useMoves } from "../../../navigation/moves"
import { describeError } from "../../../wording/errors"
import { LOCATE_REQUEST, parlorNote, typedParlorRefused } from "../../../wording/parlor"
import { borderText, formulaHandle, formulaNameAmong } from "../../../wording/pachinko/formula"
import { KindMark } from "../formulas/KindMark"
import { HyenaHuntByRate } from "../formulas/HyenaHuntByRate"
import { HyenaHuntRun } from "../formulas/HyenaHuntRun"
import { SelectionReason } from "../formulas/SelectionReason"
import { useBookFavorites } from "../../live/book-favorites"
import { EMPTY_PACHINKO_START, type PachinkoMachineChoice, type ParlorChoice, useStartBallValue, useStartForm } from "../../live/start-form"
import { locateAddress, submitAddress } from "../../live/submission-return"
import { readTerms, type TermsField } from "../../live/start-terms"
import { carriedInShown, readCarriedIn, tokensCarriedTo, tokensInHandUnreadable } from "../../live/tokens-in-hand"
import { Terms } from "./Terms"

/**
 * The machine, as a field that only opens the machine search: it shows what
 * was chosen there, and choosing again starts from it.
 */
function MachineField(props: {
  readonly machine: PachinkoMachineChoice
  readonly invalid: boolean
  readonly onOpen: () => void
  readonly onFocus: () => void
}): JSX.Element {
  const app = useApp()
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary" id="machine-field-label">
        機種
      </span>
      <button
        type="button"
        aria-labelledby="machine-field-label"
        aria-invalid={props.invalid}
        onClick={() => props.onOpen()}
        onFocus={() => props.onFocus()}
        classList={redRing(props.invalid)}
        class="flex h-10 items-center justify-between gap-2 rounded-[3px] bg-surface-input px-3 text-left focus:outline-2 focus:outline-offset-0 focus:outline-focus-ring"
      >
        <Show when={props.machine.type === "catalog" ? props.machine.name : undefined} keyed fallback={<span class="text-text-muted">機種選択</span>}>
          {(name) => <span class="truncate text-text-primary">{shownNameOf(app.machineNames(), name)}</span>}
        </Show>
        <span class="text-text-muted" aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  )
}

/**
 * The formula a play will be weighed against, beside its machine: chosen for
 * you — your favourite, or else the best ranked — with an icon saying which,
 * or chosen by hand on the machine's page, which pressing it opens: the
 * machine's formulas side by side, each with what people have done with
 * it, one of them taken with 「これを使う」. The question mark opens the one
 * chosen, and the copy button puts its id and name on the clipboard for passing
 * on. Before a machine is chosen it is there, waiting: pressing it nudges
 * the machine, and the two buttons each say what they are for.
 */
function FormulaField(props: {
  readonly detail: PachinkoMachineDetail | undefined
  readonly selection: Selection<Formula> | undefined
  readonly ballValue: number | undefined
  /** Opens the machine's page, where its formulas are chosen from. */
  readonly onOpenMachine: (machineId: string) => void
  readonly onWaitingOnMachine: () => void
}): JSX.Element {
  const moves = useMoves()
  const empty = createNudge()
  const press = (): void => {
    if (props.detail === undefined) props.onWaitingOnMachine()
    else props.onOpenMachine(props.detail.machine.id)
  }
  const waitingText = (): string => (props.detail === undefined ? "先に機種を選んでください" : "算出条件を選ぶ")
  const nameOf = (chosen: Selection<Formula>): string =>
    formulaNameAmong(
      chosen.listing.formula,
      (props.detail?.formulas ?? []).map((listing) => listing.formula),
    )
  const open = (formulaId: FormulaId): void => {
    if (props.detail !== undefined) moves.go({ kind: "pachinko-formula", machineId: props.detail.machine.id, formulaId })
  }
  /** The chosen formula's id and name, put on the clipboard for passing on — "pick this one" — to whoever plays beside you. */
  const copyChosen = async (chosen: Selection<Formula>): Promise<void> => {
    const handle = formulaHandle(chosen.listing.formula)
    const copied = await copyText(handle)
    toast(copied.ok ? { title: "算出条件のIDと名前をコピーしました", description: handle } : { title: "コピーできませんでした", tone: "error" })
  }
  const copySelected = async (): Promise<void> => {
    if (props.selection !== undefined) await copyChosen(props.selection)
  }
  const openSelected = (): void => {
    if (props.selection !== undefined) open(props.selection.listing.formula.id)
  }
  const chosenFigures = (): Figures | undefined => props.selection?.listing.formula.figures
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <div class="flex items-end gap-1">
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <span class="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-text-secondary" id="formula-field-label">
            算出条件
            <Show when={props.selection} keyed>
              {(selected) => <SelectionReason by={selected.by} class="size-3.5" />}
            </Show>
          </span>
          <button
            type="button"
            aria-labelledby="formula-field-label"
            aria-invalid={empty.red()}
            onClick={press}
            onFocus={empty.settle}
            classList={redRing(empty.red())}
            class="flex h-10 items-center justify-between gap-2 rounded-[3px] bg-surface-input px-3 text-left focus:outline-2 focus:outline-offset-0 focus:outline-focus-ring"
          >
            <Show when={props.selection} keyed fallback={<span class="truncate text-text-muted">{waitingText()}</span>}>
              {(selected) => (
                <span class="flex min-w-0 items-center gap-2 text-text-primary">
                  <KindMark kind={selected.listing.formula.kind} />
                  <span class="truncate">{nameOf(selected)}</span>
                </span>
              )}
            </Show>
            <span class="text-text-muted" aria-hidden="true">
              ›
            </span>
          </button>
        </div>
        <HintedIconButton label="算出条件のIDと名前をコピー" hint="算出条件のIDと名前をコピーできます" ready={props.selection !== undefined} onPress={() => void copySelected()}>
          <CopyIcon />
        </HintedIconButton>
        <HintedIconButton label="算出条件を見る" hint="算出条件の根拠が見れます" ready={props.selection !== undefined} onPress={openSelected} semipro>
          <QuestionIcon />
        </HintedIconButton>
      </div>
      <Switch>
        <Match when={chosenFigures()} keyed>
          {(chosen) => (
            <Show when={props.ballValue} keyed>
              {(value) => <p class="text-xs tabular-nums text-text-muted">ボーダー {borderText(borderOf(chosen, value))}</p>}
            </Show>
          )}
        </Match>
        <Match when={props.detail?.formulas.length === 0}>
          <p class="text-xs text-text-muted">この機種には算出条件がありません。</p>
        </Match>
      </Switch>
    </div>
  )
}

/** A spin performance as typed, when it is one: spins per ¥1,000, above zero. */
const spinPerformanceOf = (text: string): number | undefined => {
  const value = Number(tidyTyped(text))
  return tidyTyped(text) !== "" && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * 遊タイム狙い before sitting down, for a machine with a 遊タイム: from the data
 * counter as it stands and the terms' exchange rate, the spin rate sitting
 * down breaks even at and what it comes to around it; then, at a spin
 * performance typed in, what it comes to there, and its sampling — whose
 * button is there throughout, and marks the rate while there is none.
 */
function StartHyenaHunt(props: { readonly basis: Basis; readonly figures: Figures | undefined; readonly counter: string; readonly ballValue: number | undefined }): JSX.Element {
  const [rate, setRate] = createSignal("")
  const unready = createNudge()
  const initialSpins = (): number => Number(tidyTyped(props.counter) || "0")
  const play = createMemo((): PlayDto | undefined => {
    const spins = spinPerformanceOf(rate())
    return spins === undefined || props.ballValue === undefined ? undefined : { spinPerformance: spins, ballValue: props.ballValue }
  })
  return (
    <section class="flex flex-col gap-3" aria-label="遊タイム狙い">
      <h2 class="border-b border-border pb-1 text-sm font-bold text-text-primary">遊タイム狙い</h2>
      <Show when={props.ballValue} keyed fallback={<p class="text-xs text-text-muted">交換率を入れると、着席時データカウンターから打つボーダーが出ます。</p>}>
        {(ballValue) => <HyenaHuntByRate basis={props.basis} initialSpins={initialSpins()} ballValue={ballValue} usual={props.figures === undefined ? undefined : borderOf(props.figures, ballValue)} rate={spinPerformanceOf(rate())} />}
      </Show>
      <hr class="border-border" />
      <HyenaHuntRun
        basis={props.basis}
        initialSpins={initialSpins()}
        play={play()}
        onUnready={unready.nudge}
        leading={
          <div class="w-32">
            <TextField
              label="着席前予想回転率"
              value={rate()}
              onChange={setRate}
              inputMode="decimal"
              suffix="回/千円"
              invalid={unready.red() && spinPerformanceOf(rate()) === undefined}
              onFocus={unready.settle}
            />
          </div>
        }
      />
      <Show when={play() === undefined}>
        <p class="text-xs text-text-muted">着席前の予想回転率と交換率が分かると、その期待値が出て、シミュレーションできます。</p>
      </Show>
    </section>
  )
}

/** A parlor this device submitted, as the field offers it: waiting on the list, or turned down by it. */
interface Waiting {
  readonly submission: Submission
  readonly rejected: boolean
}

/** The device's submissions the list has not taken yet, each marked if the list turned it down. */
const waitingOf = (list: ParlorList, submissions: readonly Submission[]): readonly Waiting[] =>
  submissions
    .filter((kept) => !list.parlors.some((parlor) => parlor.submissions.includes(kept.submission)))
    .map((kept) => ({ submission: kept, rejected: list.rejections.some((rejection) => rejection.submission === kept.submission) }))

const choiceKey = (choice: ParlorChoice): string | undefined =>
  choice.type === "listed" ? `listed:${choice.id}` : choice.type === "submitted" ? `submitted:${choice.submission}` : undefined

const choiceOf = (key: string | undefined): ParlorChoice => {
  if (key?.startsWith("listed:") === true) return { type: "listed", id: key.slice("listed:".length) as SharedParlorId }
  if (key?.startsWith("submitted:") === true) return { type: "submitted", submission: key.slice("submitted:".length) as SubmissionId }
  return { type: "none" }
}

const SUBMIT_PARLOR = "一覧にない店舗を申請する"

/** Where the device is, once it has answered: a place, or why it could not say. */
type Located = Result<Coordinates, LocateError>

/**
 * The parlor: the listed parlors nearest first once the device says where it
 * is — worked out here, sent nowhere — or by prefecture and name until then,
 * searched by name, reading or any word they are known by; then this
 * device's submissions still waiting on the list.
 * Nothing is chosen for the person: where they are only orders the list.
 * Not listed, it is
 * submitted at survey.p-lens.jp with the plus — which never takes the
 * focus — and comes back waiting. The list's parlors not yet placed on the
 * map are offered too, marked, and come first among what a search finds; one chosen, a request to report where it is
 * comes slowly into view under the field, leading to the survey. A name
 * typed that chose no parlor stays as typed, in red, with why no play is
 * started on it. Left empty, the play has no parlor and is
 * recorded by its totals in yen.
 */
function ParlorField(props: {
  readonly list: ParlorList
  readonly submissions: readonly Submission[]
  readonly here: Located | undefined
  readonly choice: ParlorChoice
  readonly surveyUrl: string | undefined
  /** The field holds a name that was typed and chose no parlor. */
  readonly typedOnly: boolean
  readonly onChoose: (choice: ParlorChoice) => void
  readonly onTyped: (typed: string) => void
}): JSX.Element {
  const waiting = (): readonly Waiting[] => waitingOf(props.list, props.submissions)
  /** The list's parlors by id: a search asks about every option in turn, and finding each among them all would be the list times itself. */
  const listedById = createMemo(() => new Map(props.list.parlors.map((parlor) => [parlor.id as string, parlor])))
  const listed = (): readonly { readonly parlor: SharedParlor; readonly note: string }[] => {
    const here = props.here
    return here?.ok === true
      ? nearestFirst(props.list.parlors, here.value).map((near) => ({ parlor: near.parlor, note: parlorNote(near.parlor, near.metres) }))
      : props.list.parlors.map((parlor) => ({ parlor, note: parlorNote(parlor, undefined) }))
  }
  const options = createMemo(() => [
    ...listed().map((entry) => ({ value: `listed:${entry.parlor.id}`, label: entry.parlor.name, note: entry.note, foundFirst: entry.parlor.location === undefined })),
    ...waiting().map((entry) => ({ value: `submitted:${entry.submission.submission}`, label: entry.submission.name, note: entry.rejected ? "申請は却下" : "申請中" })),
  ])
  const matches = (key: string, typed: string): boolean => {
    const choice = choiceOf(key)
    if (choice.type === "listed") {
      const parlor = listedById().get(choice.id)
      return parlor !== undefined && parlorMatches(parlor, typed)
    }
    const kept = choice.type === "submitted" ? props.submissions.find((candidate) => candidate.submission === choice.submission) : undefined
    return kept !== undefined && searchKeyOf(kept.name).includes(searchKeyOf(typed))
  }
  /**
   * Off to survey.p-lens.jp to submit the parlor, coming back here with it.
   * A build that names no survey says so instead of going nowhere.
   */
  const submit = (): void => {
    if (props.surveyUrl === undefined) {
      toast({ title: "店舗の申請はまだ準備中です", description: "一覧にない店舗は、店舗名なしで記録できます。" })
      return
    }
    window.location.assign(submitAddress(props.surveyUrl, window.location.origin, { type: "start", game: "pachinko" }))
  }
  /**
   * The chosen parlor, where the list has it without a position, and there
   * is a survey to report one at. The same parlor is the same answer, so
   * what is shown of it stays as it is while the rest of the form is typed into.
   */
  const unplaced = createMemo(
    (): { readonly parlor: SharedParlor; readonly survey: string } | undefined => {
      const choice = props.choice
      const parlor = choice.type === "listed" ? listedById().get(choice.id) : undefined
      return parlor === undefined || parlor.location !== undefined || props.surveyUrl === undefined ? undefined : { parlor, survey: props.surveyUrl }
    },
    undefined,
    { equals: (was, now) => was?.parlor === now?.parlor && was?.survey === now?.survey },
  )
  return (
    <div class="grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2">
      <div class="flex min-w-0 items-end gap-2">
        <div class="min-w-0 flex-1">
          <Combobox
            label="店舗"
            options={options()}
            value={choiceKey(props.choice)}
            onChange={(key) => props.onChoose(choiceOf(key))}
            matches={matches}
            placeholder="店舗名なし"
            invalid={props.typedOnly}
            onTyped={props.onTyped}
          />
        </div>
        <button
          type="button"
          aria-label={SUBMIT_PARLOR}
          title={SUBMIT_PARLOR}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={submit}
          class="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border text-text-secondary hover:border-text-secondary hover:text-text-primary [&_svg]:size-5"
        >
          <PlusIcon />
        </button>
      </div>
      <Show when={props.typedOnly}>
        <p role="alert" class="col-start-1 text-xs text-negative">
          {typedParlorRefused("starting")}
        </p>
      </Show>
      <Show when={unplaced()} keyed>
        {(found) => (
          <a
            href={locateAddress(found.survey, window.location.origin, { type: "start", game: "pachinko" }, found.parlor)}
            class="col-start-1 animate-[emerge_1.6s_ease-out] text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary"
          >
            {LOCATE_REQUEST}
          </a>
        )}
      </Show>
    </div>
  )
}

const COUNT = /^\d+$/

/** Why a field's text cannot be written, if it cannot. Leaving a field empty is not one of these. */
const unwritable = (text: string): string | undefined => (isWritableText(text) ? undefined : "「,」「;」や改行は使えません。")

/** A count as typed at the seat, none typed being none yet. */
const countTyped = (text: string): number => Number(tidyTyped(text) || "0")

const notACount = (text: string): string | undefined => (tidyTyped(text) === "" || COUNT.test(tidyTyped(text)) ? undefined : "整数で入力してください。")

/**
 * Starting a pachinko play, in three parts: the parlor with its corner's
 * terms, the machine with its formula chosen beside it, and the cabinet as
 * it was found. The machine and the terms are required;
 * what is missing turns red once the button is pressed, fading back after a
 * moment, and nothing is said before.
 */
export function Start(props: {
  readonly list: ParlorList
  readonly submissions: readonly Submission[]
}): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const [starting, setStarting] = createSignal(false)
  const [here] = createResource(() => app.services.locate())
  /** What the parlor field holds, chosen or only typed: a name typed that chose no parlor stops the play starting. */
  const [parlorTyped, setParlorTyped] = createSignal("")
  const machineNudge = createNudge()
  const termsNudge = createNudge()
  /** The chosen parlor as the book will know it — its identity and name — or none. */
  const chosenParlor = (): { readonly identity: ParlorIdentity; readonly name: string } | undefined => {
    const choice = start.form().parlor
    if (choice.type === "listed") {
      const parlor = props.list.parlors.find((candidate) => candidate.id === choice.id)
      return parlor === undefined ? undefined : { identity: { type: "listed", id: parlor.id as string as ParlorId }, name: parlor.name }
    }
    const kept = choice.type === "submitted" ? props.submissions.find((candidate) => candidate.submission === choice.submission) : undefined
    return kept === undefined ? undefined : { identity: { type: "submitted", submission: kept.submission }, name: kept.name }
  }
  const ballValue = useStartBallValue()
  const chosenMachine = (): (PachinkoMachineChoice & { readonly type: "catalog" }) | undefined => {
    const machine = start.form().pachinko.machine
    return machine.type === "catalog" ? machine : undefined
  }
  /** The chosen machine's id as a value of its own, so typing elsewhere does not reload the machine. */
  const machineId = createMemo((): string | undefined => chosenMachine()?.machineId)
  const [machineDetail] = createResource(
    () => {
      const chosen = machineId()
      return chosen === undefined ? undefined : { machineId: chosen, revision: app.revision() }
    },
    (source) => loadMachine(app.services.catalog, source.machineId),
  )
  const favorites = useBookFavorites()
  /** The formula chosen by hand as a value of its own, so typing elsewhere chooses nothing again. */
  const chosenFormulaId = createMemo(() => start.form().pachinko.formulaId)
  const selection = createMemo((): Selection<Formula> | undefined => {
    const found = machineDetail()
    const kept = found?.ok === true ? favorites.keptAmong(found.value.formulas.map((listing) => listing.formula.id)) : undefined
    if (found?.ok !== true || kept === undefined) return undefined
    const chosen = chosenFormulaId()
    return (chosen === undefined ? undefined : selectById(found.value.formulas, chosen)) ?? autoSelect(found.value.formulas, worthOf, kept)
  })
  const openMachine = (machineId: string): void => moves.go({ kind: "pachinko-machine", machineId })
  const machineMissing = (): boolean => chosenMachine() === undefined
  /** The chosen formula's bonuses, for the play to choose its jackpots from. */
  const listedBonuses = (): readonly MachineBonus[] => selection()?.listing.formula.bonuses ?? []
  /** The chosen formula's basis, when its machine has a 遊タイム to hyena hunt for. */
  const hyenaHuntBasis = createMemo((): Basis | undefined => {
    const formula = selection()?.listing.formula
    const basis = formula === undefined ? undefined : basisOf(formula)
    return basis !== undefined && reliefDriveOf(basis) !== undefined ? basis : undefined
  })
  /** Where the play is: the chosen parlor on the corner's terms, with the pool they make, or none. No book hears of it until the play is recorded. */
  const venue = (): PlayVenue => {
    const read = readTerms(start.form().terms.pachinko, "pachinko")
    const terms = read.ok ? read.value : undefined
    const parlor = chosenParlor()
    return parlor === undefined || terms === undefined ? { type: "none", terms } : { type: "parlor", parlor: { ...parlor, pools: [poolOf("pachinko", terms)] }, terms }
  }
  /** The terms' fields that do not read: a play is not started without its corner's terms, at a parlor or at none. */
  const termsProblems = (): readonly TermsField[] => {
    const read = readTerms(start.form().terms.pachinko, "pachinko")
    return read.ok ? [] : read.error
  }
  /** The balls the play is begun with in hand: what the day's play before left at this place, unless typed over. */
  const carriedShown = (): string => carriedInShown(start.form().carriedIn, tokensCarriedTo(app.services.preferences.tokensInHand(), app.services.businessDay(), venue(), "pachinko"))
  const carriedUnread = (): boolean => readCarriedIn(carriedShown()).type === "unread"
  const textProblems = (): readonly (string | undefined)[] => [
    carriedUnread() ? "整数で入力してください。" : undefined,
    unwritable(start.form().cabinetNumber),
    notACount(start.form().startCounter),
    notACount(start.form().pachinko.seatTotal),
    notACount(start.form().pachinko.seatJackpots),
  ]

  /** Nudges whatever starting is waiting on, and says whether anything stops it. */
  const nudgeWhatIsMissing = (): boolean => {
    if (machineMissing()) machineNudge.nudge()
    if (termsProblems().length > 0) termsNudge.nudge()
    return holdsTypedOnly(parlorTyped(), chosenParlor()?.name) || machineMissing() || termsProblems().length > 0 || textProblems().some((problem) => problem !== undefined)
  }

  const begin = async (): Promise<void> => {
    settleTyping()
    if (starting() || nudgeWhatIsMissing()) return
    setStarting(true)
    const form = start.form()
    const formula = selection()?.listing.formula
    const startedAt = app.services.now()
    const kept = tokensCarriedTo(app.services.preferences.tokensInHand(), app.services.businessDay(), venue(), "pachinko")
    const said = readCarriedIn(carriedShown())
    const carriedIn = said.type === "count" ? said.count : undefined
    const draft: PlayDraft = {
      id: app.services.newPlayId(),
      date: app.services.businessDay(),
      venue: venue(),
      gameKind: "pachinko",
      machine: chosenMachine()?.name ?? "",
      pachinko: formula === undefined ? undefined : snapshotOf(formula),
      bonuses: listedBonuses(),
      cabinetNumber: form.cabinetNumber.trim() === "" ? undefined : form.cabinetNumber.trim(),
      startedAt,
      log: appendCheckpoint("", { spins: 0, outlay: 0, at: startedAt, counter: { spins: countTyped(form.startCounter), total: countTyped(form.pachinko.seatTotal), jackpots: countTyped(form.pachinko.seatJackpots) }, ...(carriedIn === undefined ? {} : { held: carriedIn }) }),
    }
    const started = await startPlay(app.services.drafts, draft)
    setStarting(false)
    if (!started.ok) {
      setFailure(started.error)
      return
    }
    if (kept !== undefined) app.services.preferences.setTokensInHand(undefined)
    if (formula !== undefined) await recordUse(app.services.catalog, { type: "formula", id: formula.id })
    start.update({ cabinetNumber: "", startCounter: "", carriedIn: undefined, pachinko: { ...EMPTY_PACHINKO_START, remakeFrom: start.form().pachinko.remakeFrom } })
    app.wrote()
    moves.go({ kind: "live-play", playId: draft.id })
  }

  return (
    <div class="flex flex-col gap-5">
      <section class="flex flex-col gap-4" aria-labelledby="start-parlor">
        <h2 id="start-parlor" class="border-b border-border pb-1 text-sm font-bold text-text-primary">店舗設定</h2>
        <ParlorField
          list={props.list}
          submissions={props.submissions}
          here={here()}
          choice={start.form().parlor}
          surveyUrl={app.services.surveyUrl}
        typedOnly={holdsTypedOnly(parlorTyped(), chosenParlor()?.name)}
        onTyped={setParlorTyped}
          onChoose={(parlor) => start.update({ parlor })}
        />
        <Terms
          form={start.form().terms.pachinko}
          invalid={termsNudge.red() ? termsProblems() : []}
          onFocus={termsNudge.settle}
          onChange={(form) => start.update({ terms: { ...start.form().terms, pachinko: form } })}
        />
      </section>
      <section class="flex flex-col gap-4" aria-labelledby="start-machine">
        <div class="flex items-center justify-between gap-2 border-b border-border pb-1">
          <h2 id="start-machine" class="text-sm font-bold text-text-primary">
            機種設定
          </h2>
          <PencilledBubble text={`${start.form().cabinetNumber.trim() === "" ? "---" : start.form().cabinetNumber.trim()}番台`} says="台番号を入力する" invalid={unwritable(start.form().cabinetNumber) !== undefined}>
            <TextField label="台番号" value={start.form().cabinetNumber} onChange={(cabinetNumber) => start.update({ cabinetNumber })} inputMode="numeric" error={unwritable(start.form().cabinetNumber)} compact />
          </PencilledBubble>
        </div>
        <div class="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 sm:gap-2">
          <MachineField
            machine={start.form().pachinko.machine}
            invalid={machineNudge.red()}
            onOpen={() => moves.go({ kind: "pachinko-machine-search" })}
            onFocus={machineNudge.settle}
          />
          <Show
            when={chosenMachine()}
            fallback={<FormulaField detail={undefined} selection={undefined} ballValue={ballValue()} onOpenMachine={openMachine} onWaitingOnMachine={machineNudge.nudge} />}
          >
            <Loaded outcome={machineDetail()}>
              {(detail) => <FormulaField detail={detail} selection={selection()} ballValue={ballValue()} onOpenMachine={openMachine} onWaitingOnMachine={machineNudge.nudge} />}
            </Loaded>
          </Show>
        </div>
      </section>
      <section class="flex flex-col gap-4" aria-labelledby="start-seat">
        <h2 id="start-seat" class="border-b border-border pb-1 text-sm font-bold text-text-primary">開始時データ</h2>
        <div class="grid grid-cols-1 gap-x-2 sm:grid-cols-2">
          <div class="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-start gap-1.5">
            <TextField
              label="総回転数"
              value={start.form().pachinko.seatTotal}
              onChange={(seatTotal) => start.updatePachinko({ seatTotal })}
              inputMode="numeric"
              placeholder="0"
              error={notACount(start.form().pachinko.seatTotal)}
              compact
            />
            <TextField
              label="ゲーム数"
              value={start.form().startCounter}
              onChange={(startCounter) => start.update({ startCounter })}
              inputMode="numeric"
              placeholder="0"
              error={notACount(start.form().startCounter)}
              compact
            />
            <TextField
              label="大当り数"
              value={start.form().pachinko.seatJackpots}
              onChange={(seatJackpots) => start.updatePachinko({ seatJackpots })}
              inputMode="numeric"
              placeholder="0"
              error={notACount(start.form().pachinko.seatJackpots)}
              compact
            />
            <DetailButton label="詳細" says={carriedShown() === "" ? "詳細（開始時の持ち玉）" : `詳細（開始時の持ち玉 ${carriedShown()}玉）`} marked={carriedShown() !== ""} invalid={carriedUnread()} placement="bottom-end">
              <div class="min-w-0 flex-1">
                <TextField
                  label="開始時の持ち玉"
                  value={carriedShown()}
                  onChange={(carriedIn) => start.update({ carriedIn })}
                  inputMode="numeric"
                  suffix="玉"
                  invalid={carriedUnread()}
                  error={tokensInHandUnreadable(app.services.preferences.tokensInHand(), app.services.businessDay()) ? "この端末に残した持ち玉の控えが壊れていて読めません。手で入れてください。" : undefined}
                  compact
                />
              </div>
            </DetailButton>
          </div>
        </div>
      </section>
      <Show when={hyenaHuntBasis()}>
        {(basis) => <StartHyenaHunt basis={basis()} figures={selection()?.listing.formula.figures} counter={start.form().startCounter} ballValue={ballValue()} />}
      </Show>
      <Show when={failure()} keyed>
        {(error) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
            {describeError(error)}
          </div>
        )}
      </Show>
      <div>
        <Button onClick={() => void begin()}>
          打ち始める
        </Button>
      </div>
    </div>
  )
}
