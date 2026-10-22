import { createMemo, createResource, createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { startPlay } from "../../../../application/live-play"
import { recordUse } from "../../../../application/catalog"
import { shownNameOf } from "../../../../core/catalog/catalog"
import type { PlayDraft, PlayVenue } from "../../../../core/live-play/draft"
import { nearestFirst } from "../../../../core/parlor/distance"
import type { ParlorId, ParlorIdentity, SubmissionId } from "../../../../core/parlor/parlor"
import { parlorMatches } from "../../../../core/parlor/search"
import { searchKeyOf } from "../../../../core/text/search-key"
import type { Coordinates, ParlorList, SharedParlor, SharedParlorId } from "../../../../core/parlor/shared"
import type { Weighing } from "../../../../core/pachislot/weighing"
import { poolOf, type PlayTerms } from "../../../../core/parlor/terms"
import { appendCheckpoint } from "../../../../core/play-log/checkpoint"
import { isWritableText } from "../../../../core/tally/validate"
import type { Result } from "../../../../core/result/result"
import type { LocateError } from "../../../../location/port/locator"
import type { Submission } from "../../../../parlors/port/submission-store"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { Combobox, holdsTypedOnly } from "../../../primitives/combobox"
import { DetailButton } from "../../../primitives/detail-button"
import { PlusIcon } from "../../../primitives/icons"
import { createNudge, redRing } from "../../../primitives/nudge"
import { PencilledBubble } from "../../../primitives/pencilled-bubble"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { useMoves } from "../../../navigation/moves"
import { describeError } from "../../../wording/errors"
import { FIELD_PROBLEM_TEXT, UNWRITABLE_TEXT } from "../../../wording/fields"
import { LOCATE_REQUEST, parlorNote, typedParlorRefused } from "../../../wording/parlor"
import { FormulaPicker, PriorPicker } from "./ChoiceFields"
import { SeatFields, useSeat } from "./Seat"
import { EMPTY_PACHISLOT_START, type PachislotMachineChoice, type ParlorChoice, useStartForm } from "../../live/start-form"
import { locateAddress, submitAddress } from "../../live/submission-return"
import { readTerms, type TermsField } from "../../live/start-terms"
import { carriedInShown, readCarriedIn, tokensCarriedTo, tokensInHandUnreadable } from "../../live/tokens-in-hand"
import { Terms } from "./Terms"

/**
 * The machine, as a field that only opens the pachislot machine search: it
 * shows what was chosen there, and choosing again starts from it.
 */
function MachineField(props: {
  readonly machine: PachislotMachineChoice
  readonly invalid: boolean
  readonly onOpen: () => void
  readonly onFocus: () => void
}): JSX.Element {
  const app = useApp()
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary" id="pachislot-machine-field-label">
        機種
      </span>
      <button
        type="button"
        aria-labelledby="pachislot-machine-field-label"
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
    window.location.assign(submitAddress(props.surveyUrl, window.location.origin, { type: "start", game: "pachislot" }))
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
            href={locateAddress(found.survey, window.location.origin, { type: "start", game: "pachislot" }, found.parlor)}
            class="col-start-1 animate-[emerge_1.6s_ease-out] text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary"
          >
            {LOCATE_REQUEST}
          </a>
        )}
      </Show>
    </div>
  )
}

/** Why a field's text cannot be written, if it cannot. Leaving a field empty is not one of these. */
const unwritable = (text: string): string | undefined => (isWritableText(text) ? undefined : UNWRITABLE_TEXT)

/**
 * Starting a pachislot play, in three parts: the parlor with its corner's
 * terms, the machine with its formula chosen beside it and its 設定配分,
 * and the cabinet as it was found — its data counter and what the seat
 * looks like. The machine and the terms are required; what
 * is missing turns red when the button is pressed, fading back after a
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
  /** What the parlor field holds, chosen or only typed: a name typed that chose no parlor stops the play starting. */
  const [parlorTyped, setParlorTyped] = createSignal("")
  const machineNudge = createNudge()
  const termsNudge = createNudge()
  const seatNudge = createNudge()
  const seat = useSeat()
  const [starting, setStarting] = createSignal(false)
  const [here] = createResource(() => app.services.locate())
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
  const chosenMachine = (): (PachislotMachineChoice & { readonly type: "catalog" }) | undefined => {
    const machine = start.form().pachislot.machine
    return machine.type === "catalog" ? machine : undefined
  }
  const machineMissing = (): boolean => chosenMachine() === undefined
  /** Where the play is: the chosen parlor on the corner's terms, with the pool they make, or none. No book hears of it until the play is recorded. */
  const venue = (): PlayVenue => {
    const read = readTerms(start.form().terms.pachislot, "pachislot")
    const terms = read.ok ? read.value : undefined
    const parlor = chosenParlor()
    return parlor === undefined || terms === undefined ? { type: "none", terms } : { type: "parlor", parlor: { ...parlor, pools: [poolOf("pachislot", terms)] }, terms }
  }
  /** The terms' fields that do not read: a play is not started without its corner's terms, at a parlor or at none. */
  const termsProblems = (): readonly TermsField[] => {
    const read = readTerms(start.form().terms.pachislot, "pachislot")
    return read.ok ? [] : read.error
  }
  /** The medals the play is begun with in hand: what the day's play before left at this place, unless typed over. */
  const carriedShown = (): string => carriedInShown(start.form().carriedIn, tokensCarriedTo(app.services.preferences.tokensInHand(), app.services.businessDay(), venue(), "pachislot"))
  const carriedUnread = (): boolean => readCarriedIn(carriedShown()).type === "unread"
  const textProblems = (): readonly (string | undefined)[] => [carriedUnread() ? FIELD_PROBLEM_TEXT["not-a-count"] : undefined, unwritable(start.form().cabinetNumber)]
  /** The corner's terms as read, for weighing the seat: none until they read. */
  const terms = (): PlayTerms | undefined => {
    const read = readTerms(start.form().terms.pachislot, "pachislot")
    return read.ok ? read.value : undefined
  }

  /** Nudges whatever starting is waiting on, and says whether anything stops it. */
  const nudgeWhatIsMissing = (): boolean => {
    const seatUnread = !seat.seat().ok
    if (machineMissing()) machineNudge.nudge()
    if (termsProblems().length > 0) termsNudge.nudge()
    if (seatUnread) seatNudge.nudge()
    return holdsTypedOnly(parlorTyped(), chosenParlor()?.name) || machineMissing() || termsProblems().length > 0 || seatUnread || textProblems().some((problem) => problem !== undefined)
  }

  /** The formula and the 設定配分 the play starts with each count one more use. */
  const recordUses = async (weighing: Weighing): Promise<void> => {
    await recordUse(app.services.catalog, { type: "formula", id: weighing.formula.id })
    if (weighing.prior.type === "distribution") await recordUse(app.services.catalog, { type: "distribution", id: weighing.prior.id })
  }

  const begin = async (): Promise<void> => {
    settleTyping()
    if (starting() || nudgeWhatIsMissing()) return
    const first = seat.firstLine(app.services.now())
    if (first === undefined) return
    setStarting(true)
    const form = start.form()
    const weighing = seat.weighing()
    const startedAt = app.services.now()
    const kept = tokensCarriedTo(app.services.preferences.tokensInHand(), app.services.businessDay(), venue(), "pachislot")
    const said = readCarriedIn(carriedShown())
    const carriedIn = said.type === "count" ? said.count : undefined
    const draft: PlayDraft = {
      id: app.services.newPlayId(),
      date: app.services.businessDay(),
      venue: venue(),
      gameKind: "pachislot",
      machine: chosenMachine()?.name ?? "",
      ...(weighing === undefined ? {} : { pachislot: weighing }),
      cabinetNumber: form.cabinetNumber.trim() === "" ? undefined : form.cabinetNumber.trim(),
      startedAt,
      log: appendCheckpoint("", { ...first, at: startedAt, ...(carriedIn === undefined ? {} : { held: carriedIn }) }),
    }
    const started = await startPlay(app.services.drafts, draft)
    setStarting(false)
    if (!started.ok) {
      setFailure(started.error)
      return
    }
    if (kept !== undefined) app.services.preferences.setTokensInHand(undefined)
    if (weighing !== undefined) await recordUses(weighing)
    start.update({ cabinetNumber: "", startCounter: "", carriedIn: undefined, pachislot: EMPTY_PACHISLOT_START })
    app.wrote()
    moves.replace({ kind: "live-play", playId: draft.id })
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
          form={start.form().terms.pachislot}
          invalid={termsNudge.red() ? termsProblems() : []}
          onFocus={termsNudge.settle}
          onChange={(form) => start.update({ terms: { ...start.form().terms, pachislot: form } })}
        />
      </section>
      <section class="flex flex-col gap-4" aria-labelledby="start-machine">
        <div class="flex items-center justify-between gap-2 border-b border-border pb-1">
          <h2 id="start-machine" class="text-sm font-bold text-text-primary">
            機種設定
          </h2>
          <PencilledBubble text={`${start.form().cabinetNumber.trim() === "" ? "----" : start.form().cabinetNumber.trim()}番台`} says="台番号を入力する" invalid={unwritable(start.form().cabinetNumber) !== undefined}>
            <TextField label="台番号" value={start.form().cabinetNumber} onChange={(cabinetNumber) => start.update({ cabinetNumber })} inputMode="numeric" error={unwritable(start.form().cabinetNumber)} compact />
          </PencilledBubble>
        </div>
        <div class="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 sm:gap-2">
          <MachineField
            machine={start.form().pachislot.machine}
            invalid={machineNudge.red()}
            onOpen={() => moves.go({ kind: "pachislot-machine-search" })}
            onFocus={machineNudge.settle}
          />
          <FormulaPicker
            detail={seat.detail()}
            machineChosen={!machineMissing()}
            selection={seat.formulaSelection()}
            onOpenMachine={(machineId) => moves.go({ kind: "pachislot-machine", machineId })}
            onWaitingOnMachine={machineNudge.nudge}
          />
          <PriorPicker detail={seat.detail()} selection={seat.priorSelection()} onChoose={(prior) => start.updatePachislot({ prior })} onWaitingOnMachine={machineNudge.nudge} />
        </div>
      </section>
      <section class="flex flex-col gap-4" aria-labelledby="start-seat">
        <h2 id="start-seat" class="border-b border-border pb-1 text-sm font-bold text-text-primary">開始時データ</h2>
        <SeatFields
          state={seat}
          terms={terms()}
          nudged={seatNudge.red()}
          onFocus={seatNudge.settle}
          beside={
            <DetailButton label="詳細" says={carriedShown() === "" ? "詳細（開始時の持ちメダル）" : `詳細（開始時の持ちメダル ${carriedShown()}枚）`} marked={carriedShown() !== ""} invalid={carriedUnread()} placement="bottom-end">
              <div class="min-w-0 flex-1">
                <TextField
                  label="開始時の持ちメダル"
                  value={carriedShown()}
                  onChange={(carriedIn) => start.update({ carriedIn })}
                  inputMode="numeric"
                  suffix="枚"
                  invalid={carriedUnread()}
                  error={tokensInHandUnreadable(app.services.preferences.tokensInHand(), app.services.businessDay()) ? "この端末に残した持ちメダルの控えが壊れていて読めません。手で入れてください。" : undefined}
                  compact
                />
              </div>
            </DetailButton>
          }
        />
      </section>
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
