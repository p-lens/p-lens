import { createMemo, createResource, createSignal, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError, Outcome } from "../../../application/errors"
import { loadRecordingContext, recordTalliedPlay, type RecordingContext } from "../../../application/record-play"
import { findMachines } from "../../../application/catalog"
import { listSharedParlors } from "../../../application/shared-parlors"
import { listSubmissions } from "../../../application/submissions"
import type { BookId } from "../../../core/book/book"
import { bookNameOf, type MachineSummary } from "../../../core/catalog/catalog"
import { machineMatches } from "../../../core/catalog/description"
import { identityKey } from "../../../core/parlor/parlor"
import { EMPTY_PARLOR_LIST, type ParlorList } from "../../../core/parlor/shared"
import { renderEntry } from "../../../core/journal/entry"
import { composeTalliedEntry } from "../../../core/play/compose"
import type { IsoDate } from "../../../core/calendar/calendar"
import { tokenKindOf, type PlayGameKind, type PlayId, type TalliedPlay } from "../../../core/play/play"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { DetailButton } from "../../primitives/detail-button"
import { createNudge, redText } from "../../primitives/nudge"
import { Combobox, holdsTypedOnly } from "../../primitives/combobox"
import { PlusIcon } from "../../primitives/icons"
import { PencilledBubble } from "../../primitives/pencilled-bubble"
import { toast } from "../../primitives/toast"
import { EmptyState, Loaded } from "../../primitives/states"
import { settleTyping, TextField } from "../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { describeError, describePlayError } from "../../wording/errors"
import { formatSignedYen, toneOf, tokenUnit, UNSEEN_ACTUAL } from "../../wording/numbers"
import { LOCATE_REQUEST, typedMachineRefused, typedParlorRefused, type TypedNameRefused } from "../../wording/parlor"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import { locateAddress, submitAddress, type LeftFrom } from "../live/submission-return"
import { offersByKey, parlorOffers } from "./parlor-offers"
import { ViewHeader } from "../shell/ViewHeader"
import { IN_HAND_LABELS, RECORDING, type FieldProblem, type FormField, type SubmitWords } from "./form"
import { emptyTallyForm, heldIn, readTallyForm, resultOfTally, sidesFromTokens, type TallyForm, type TokenCounts } from "./tally-form"

/** Where a submission is: being typed, being written, or refused with why. */
type Submission =
  | { readonly type: "editing" }
  | { readonly type: "saving" }
  | { readonly type: "failed"; readonly error: ApplicationError }

/** Words for a field typed wrong. A field left empty gets none: it is only nudged, when a press needed it. */
const REASONS: Readonly<Record<Exclude<FieldProblem["reason"], "required">, string>> = {
  "not-a-number": "数字で入力してください。",
  "not-a-date": "日付を入力してください。",
}

const SUBMIT_PARLOR = "一覧にない店舗を申請する"

const CATALOG_GAMES = { pachinko: "pachinko", slot: "pachislot" } as const

const ROUND_BUTTON = "flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border text-text-secondary hover:border-text-secondary hover:text-text-primary [&_svg]:size-5"

const isGameKind = (value: string | null): value is PlayGameKind => value === "pachinko" || value === "slot"

/**
 * The form a play is added with by its totals, wherever it is added from:
 * what it starts filled with, and what recording means, are the caller's.
 * Its parlor is chosen as a play started live chooses one — from the
 * parlor list, the book's own parlors and this device's submissions — and
 * never typed: a name that chose none stays, in red, and nothing is
 * recorded on it. Its machine is one of the catalog's, of the game chosen,
 * or none; a machine the catalog lacks is registered there first, with a
 * formula, like any other.
 */
export function TallyEditor(props: {
  readonly context: RecordingContext
  /** The parlor list and this device's submissions: with the book's own parlors, all a play may be said to be at. */
  readonly list: ParlorList
  readonly submissions: readonly KeptSubmission[]
  /** The book the play is added to by hand, which the survey brings the person back to; none where a play followed live is being recorded. */
  readonly bookId: BookId | undefined
  readonly initial: TallyForm
  /** The id of the play, given the day it is said to have been played. */
  readonly playIdOn: (date: IsoDate) => PlayId
  readonly words: SubmitWords
  /** The tokens a play followed live is counted by, where it has terms to count them on: its result is worked out from them as they are typed, and may still be typed over. None for a play added by hand or set right, which has only its result. */
  readonly tokens?: TokenCounts | undefined
  readonly submit: (play: TalliedPlay) => Promise<Outcome<unknown>>
  /** Told the tokens in hand as the play ended, where it was counted by them. */
  readonly onRecorded: (play: TalliedPlay, held: number | undefined) => void
}): JSX.Element {
  const app = useApp()
  const [form, setForm] = createSignal<TallyForm>(props.initial)
  const [counts, setCounts] = createSignal<TokenCounts | undefined>(props.tokens)
  /** Types a count, and puts what the counts now come to in the two sides where they come to them. */
  const count = (typed: Pick<TokenCounts, "carriedIn"> | Pick<TokenCounts, "held">): void => {
    const before = counts()
    if (before === undefined) return
    const after = { ...before, ...typed }
    setCounts(after)
    const sides = sidesFromTokens(after)
    if (sides !== undefined) setForm((current) => ({ ...current, ...sides }))
  }
  const [submission, setSubmission] = createSignal<Submission>({ type: "editing" })
  const set =
    <K extends keyof TallyForm>(key: K) =>
    (value: TallyForm[K]): void => {
      setForm((current) => ({ ...current, [key]: value }))
    }

  /** Where the device is, asked once: the parlors are offered nearest first where it says, and by prefecture where it does not. */
  const [here] = createResource(() => app.services.locate())
  const offers = createMemo(() => {
    const found = here()
    return parlorOffers(props.context.parlors, props.list, props.submissions, found?.ok === true ? found.value : undefined)
  })
  const offerOf = createMemo(() => offersByKey(offers()))
  /** What a typed name stops here: a play being added to a book by hand, or one followed live being recorded. */
  const doing = (): TypedNameRefused => (props.bookId === undefined ? "recording" : "adding")
  /** What the parlor field holds, chosen or only typed: a name typed that chose no parlor stops the play being recorded. */
  const [parlorTyped, setParlorTyped] = createSignal("")
  const chosenName = (): string | undefined => offerOf().get(form().parlorKey)?.parlor.name
  /** Where the survey brings the person back to: this form in its book, or — a play followed live being recorded — its game's start. */
  const leftFrom = (): LeftFrom => (props.bookId === undefined ? { type: "start", game: form().gameKind } : { type: "entry", game: form().gameKind, bookId: props.bookId })
  /** Where to report the chosen parlor's position, where the list has it without one and there is a survey to report it at. */
  const locating = (): string | undefined => {
    const unplaced = offerOf().get(form().parlorKey)?.unplaced
    return unplaced === undefined || app.services.surveyUrl === undefined ? undefined : locateAddress(app.services.surveyUrl, window.location.origin, leftFrom(), unplaced)
  }
  const typedOnly = (): boolean => holdsTypedOnly(parlorTyped(), chosenName())
  /** Off to survey.p-lens.jp to submit a parlor the list lacks; a build that names no survey says so instead of going nowhere. */
  const submitParlor = (): void => {
    if (app.services.surveyUrl === undefined) {
      toast({ title: "店舗の申請はまだ準備中です", description: "一覧にない店舗は、店舗を指定せずに記録できます。" })
      return
    }
    window.location.assign(submitAddress(app.services.surveyUrl, window.location.origin, leftFrom()))
  }
  /** The catalog's machines of the game chosen: all a play added by hand may name. */
  const [catalogued] = createResource(
    () => form().gameKind,
    (gameKind) => findMachines(app.services.catalog, "", CATALOG_GAMES[gameKind]),
  )
  const machines = (): readonly MachineSummary[] => {
    const found = catalogued()
    return found?.ok === true && found.value.type === "found" ? found.value.machines : []
  }
  /** What the machine field holds, chosen or only typed: a name typed that chose no machine stops the play being recorded. */
  const [machineTyped, setMachineTyped] = createSignal("")
  /** What the machine field says of the machine chosen: the name the halls call it, though the play keeps its model name. */
  const chosenMachineLabel = (): string | undefined => machines().find((machine) => bookNameOf(machine) === form().machine)?.name
  const machineTypedOnly = (): boolean => holdsTypedOnly(machineTyped(), chosenMachineLabel())
  const offeredParlors = createMemo(() => offers().map((offer) => offer.parlor))
  const read = createMemo(() => readTallyForm(form(), offeredParlors(), props.playIdOn))
  const problemAt = (field: FormField): FieldProblem | undefined => {
    const found = read()
    return found.ok ? undefined : found.error.find((candidate) => candidate.field === field)
  }
  const problemOf = (field: FormField): string | undefined => {
    const problem = problemAt(field)
    return problem === undefined || problem.reason === "required" ? undefined : REASONS[problem.reason]
  }
  const preview = createMemo(() => {
    const play = read()
    return play.ok ? composeTalliedEntry(play.value) : undefined
  })
  const previewText = (): string | undefined => {
    const entry = preview()
    return entry?.ok === true ? renderEntry(entry.value) : undefined
  }
  const previewProblem = (): string | undefined => {
    const entry = preview()
    return entry?.ok === false ? describePlayError(entry.error) : undefined
  }
  /** The result the two sides come to, or dashes in its shape while they do not read. */
  const resultText = (): string => ((result) => (result === undefined ? UNSEEN_ACTUAL : formatSignedYen(result)))(resultOfTally(form()))
  /** Which way the result went, or no way while the two sides do not read. */
  const resultTone = (): ReturnType<typeof toneOf> | undefined => ((result) => (result === undefined ? undefined : toneOf(result)))(resultOfTally(form()))
  const nudge = createNudge()
  /** Red for a while after a press that a problem here stopped. */
  const nudged = (field: FormField): boolean => nudge.red() && problemAt(field) !== undefined
  const failure = (): ApplicationError | undefined => {
    const current = submission()
    return current.type === "failed" ? current.error : undefined
  }

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    settleTyping()
    const play = read()
    if (submission().type === "saving") return
    if (!play.ok || preview()?.ok !== true || typedOnly() || machineTypedOnly()) {
      nudge.nudge()
      return
    }
    setSubmission({ type: "saving" })
    const recorded = await props.submit(play.value)
    if (!recorded.ok) {
      setSubmission({ type: "failed", error: recorded.error })
      return
    }
    props.onRecorded(play.value, ((counted) => (counted === undefined ? undefined : heldIn(counted)))(counts()))
  }

  return (
    <form autocomplete="off" class="flex flex-col gap-5 p-4" noValidate onSubmit={(event) => void submit(event)}>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div class="w-40">
          <TextField label="日付" type="date" value={form().date} onChange={set("date")} error={problemOf("date")}
            invalid={nudged("date")}
            onFocus={nudge.settle} required />
        </div>
        <div class="flex flex-col gap-1.5">
          <div class="flex min-w-0 items-end gap-2">
            <div class="min-w-0 flex-1">
              <Combobox
                label="店舗"
                placeholder="指定しない"
                options={offers().map((offer) => ({ value: identityKey(offer.parlor.identity), label: offer.parlor.name, note: offer.note, foundFirst: offer.unplaced !== undefined }))}
                value={form().parlorKey === "" ? undefined : form().parlorKey}
                onChange={(key) => set("parlorKey")(key ?? "")}
                matches={(key, typed) => offerOf().get(key)?.matches(typed) ?? false}
                invalid={typedOnly() || nudged("parlor")}
                onFocus={nudge.settle}
                onTyped={setParlorTyped}
              />
            </div>
            <button
              type="button"
              aria-label={SUBMIT_PARLOR}
              title={SUBMIT_PARLOR}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={submitParlor}
              class={ROUND_BUTTON}
            >
              <PlusIcon />
            </button>
          </div>
          <Show when={locating()} keyed>
            {(address) => (
              <a href={address} class="animate-[emerge_1.6s_ease-out] text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary">
                {LOCATE_REQUEST}
              </a>
            )}
          </Show>
          <Show when={typedOnly()}>
            <p role="alert" class="text-xs text-negative">
              {typedParlorRefused(doing())}
            </p>
          </Show>
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">種別</span>
        <ToggleGroup
          value={form().gameKind}
          onChange={(value: string | null) => {
            if (isGameKind(value) && value !== form().gameKind) setForm((current) => ({ ...current, gameKind: value, machine: "" }))
          }}
          aria-label="種別"
        >
          <ToggleGroupItem value="pachinko">パチンコ</ToggleGroupItem>
          <ToggleGroupItem value="slot">スロット</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div class="flex flex-col gap-1.5">
        <Combobox
          label="機種"
          placeholder="指定しない"
          options={machines().map((machine) => ({ value: bookNameOf(machine), label: machine.name, ...(machine.hitChance === undefined ? {} : { note: machine.hitChance }) }))}
          value={form().machine === "" ? undefined : form().machine}
          onChange={(name) => set("machine")(name ?? "")}
          matches={(name, typed) => machines().some((machine) => bookNameOf(machine) === name && machineMatches(machine, typed))}
          invalid={machineTypedOnly()}
          onFocus={nudge.settle}
          onTyped={setMachineTyped}
          beside={
            <PencilledBubble text={`${form().cabinetNumber.trim() === "" ? "---" : form().cabinetNumber.trim()}番台`} says="台番号を入力する" invalid={false}>
              <TextField label="台番号" value={form().cabinetNumber} onChange={set("cabinetNumber")} inputMode="numeric" compact />
            </PencilledBubble>
          }
        />
        <Show when={machineTypedOnly()}>
          <p role="alert" class="text-xs text-negative">
            {typedMachineRefused(doing())}
          </p>
        </Show>
      </div>
      <Show when={counts()} keyed={false}>
        <div class="grid grid-cols-2 gap-x-3 gap-y-4">
          <TextField label={IN_HAND_LABELS[tokenKindOf(form().gameKind)].carriedIn} value={counts()?.carriedIn ?? ""} onChange={(carriedIn) => count({ carriedIn })} inputMode="numeric" suffix={tokenUnit(tokenKindOf(form().gameKind))} onFocus={nudge.settle} />
          <TextField label={IN_HAND_LABELS[tokenKindOf(form().gameKind)].left} value={counts()?.held ?? ""} onChange={(held) => count({ held })} inputMode="numeric" suffix={tokenUnit(tokenKindOf(form().gameKind))} onFocus={nudge.settle} />
        </div>
      </Show>
      <div class="grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
        <TextField label="投資額" value={form().outlay} onChange={set("outlay")} inputMode="decimal" suffix="円" error={problemOf("outlay")}
          invalid={nudged("outlay")}
          onFocus={nudge.settle} required />
        <TextField label="回収額" value={form().takings} onChange={set("takings")} inputMode="decimal" suffix="円" error={problemOf("takings")}
          invalid={nudged("takings")}
          onFocus={nudge.settle} />
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">実収支</span>
          <output class="flex h-10 items-center text-lg font-bold tabular-nums" classList={{ "text-positive": resultTone() === "positive", "text-negative": resultTone() === "negative", "text-text-primary": resultTone() === "neutral", "text-text-muted": resultTone() === undefined }}>
            {resultText()}
          </output>
        </div>
        <div class="justify-self-end">
          <DetailButton
            label="詳細"
            says={form().theoreticalValue.trim() === "" ? "詳細（期待値）" : `詳細（期待値 ${form().theoreticalValue.trim()}円）`}
            marked={form().theoreticalValue.trim() !== ""}
            invalid={problemAt("theoretical-value") !== undefined}
            placement="bottom-end"
          >
            <div class="min-w-0 flex-1">
              <TextField label="期待値" value={form().theoreticalValue} onChange={set("theoreticalValue")} inputMode="decimal" suffix="円" invalid={problemAt("theoretical-value") !== undefined} onFocus={nudge.settle} compact />
            </div>
          </DetailButton>
        </div>
      </div>
      <p class="text-xs text-text-muted">貯玉・貯メダルの残高は動きません。</p>
      <section class="flex flex-col gap-2">
        <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">書き込まれる仕訳</h2>
        <Switch fallback={<p class="text-sm text-text-muted">入力を直すと、ここに仕訳が表示されます。</p>}>
          <Match when={previewText()}>
            {(text) => <pre class="overflow-x-auto rounded-md bg-surface-0 p-3 font-mono text-xs leading-relaxed text-text-secondary">{text()}</pre>}
          </Match>
          <Match when={previewProblem()} keyed>
            {(problem) => (
              <p class="text-sm" classList={redText(nudge.red())}>
                {problem}
              </p>
            )}
          </Match>
        </Switch>
      </section>
      <Show when={failure()} keyed>
        {(error) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
            {describeError(error)}
          </div>
        )}
      </Show>
      <div>
        <Button type="submit">
          {submission().type === "saving" ? props.words.busy : props.words.idle}
        </Button>
      </div>
    </form>
  )
}

/**
 * The parlor list and this device's submissions, read for a form that
 * offers them: an empty list where it could not be read, since a play may
 * name no parlor.
 */
export const createOffered = (): { readonly list: () => ParlorList; readonly submissions: () => readonly KeptSubmission[] } => {
  const app = useApp()
  const [parlors] = createResource(() => app.revision(), () => listSharedParlors(app.services.parlors))
  const [submissions] = createResource(() => app.revision(), () => listSubmissions(app.services.submissions))
  return {
    list: () => {
      const found = parlors()
      return found?.ok === true ? found.value : EMPTY_PARLOR_LIST
    },
    submissions: () => {
      const found = submissions()
      return found?.ok === true ? found.value : []
    },
  }
}

/**
 * Adding a play to a book by hand, by its totals: what it made, what it was
 * expected to be worth, and how much of that it earned.
 */
export function TallyPlayView(props: { readonly place: Place; readonly bookId: BookId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const fresh = app.services.newPlayId()
  const [context] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadRecordingContext(app.services.session, source.bookId, app.services.member),
  )
  const offered = createOffered()
  return (
    <MainContent header={<ViewHeader place={props.place} title="記録を追加" />}>
      <div class="max-w-5xl">
        <Loaded outcome={context()}>
          {(found) => (
            <Show when={found.canWrite} fallback={<EmptyState title="この帳簿は閲覧のみです">記録するには、帳簿の所有者から編集者の権限を受け取ってください。</EmptyState>}>
              <TallyEditor
                context={found}
                list={offered.list()}
                submissions={offered.submissions()}
                bookId={props.bookId}
                initial={emptyTallyForm(app.services.businessDay())}
                playIdOn={(date) => app.services.playIdOn(fresh, date)}
                words={RECORDING}
                submit={(play) => recordTalliedPlay(app.services.session, props.bookId, play)}
                onRecorded={(play) => {
                  app.wrote()
                  moves.go({ kind: "play", bookId: props.bookId, playId: play.id })
                }}
              />
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
