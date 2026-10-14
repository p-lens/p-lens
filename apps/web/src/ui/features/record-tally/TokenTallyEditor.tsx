import { createMemo, createResource, createSignal, Match, Show, Switch, type JSX } from "solid-js"

import type { ApplicationError, Outcome } from "../../../application/errors"
import type { RecordingContext } from "../../../application/record-tally"
import { findMachines } from "../../../application/catalog"
import { bookNameOf, CATALOG_GAMES, type MachineSummary } from "../../../core/catalog/catalog"
import { machineMatches } from "../../../core/catalog/description"
import type { TokenKind } from "../../../core/commodity/commodity"
import { renderEntry } from "../../../core/journal/entry"
import { composeTokenTallyEntry } from "../../../core/tally/compose"
import { tokenTallyResultOf } from "../../../core/tally/result"
import { withAside } from "../../../core/tally/aside"
import type { TallyAside, TokenTally } from "../../../core/tally/tally"
import { tokenKindOf, type PlayId } from "../../../core/play/play"
import { mapOk } from "../../../core/result/result"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { Combobox, holdsTypedOnly } from "../../primitives/combobox"
import { createNudge, redText } from "../../primitives/nudge"
import { settleTyping, TextField } from "../../primitives/text-field"
import { describeError, describeTallyError } from "../../wording/errors"
import { formatSignedYen, formatTokens, toneOf, tokenUnit, UNSEEN_ACTUAL } from "../../wording/numbers"
import { typedMachineRefused } from "../../wording/parlor"
import { IN_HAND_LABELS, machineChoicesOf, pricesPlayedAt, readTokenTallyForm, type FieldProblem, type FormField, type PlayedAt, type TokenTallyForm, type SubmitWords } from "./form"

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

/** What the two counts are called where they are typed: the tokens an outlay rented, and the savings a replay took. */
const COUNT_LABELS: Readonly<Record<TokenKind, { readonly rented: string; readonly deducted: string }>> = {
  ball: { rented: "貸玉数", deducted: "再プレイ（貯玉減）" },
  medal: { rented: "貸メダル数", deducted: "再プレイ（貯メダル減）" },
}

/**
 * The form a tally in tokens at a parlor is recorded with, or a recorded
 * one set right: where and on what terms are its play's and shown as such; the
 * tokens rented and the savings a replay took are worked out from those
 * terms as the sums are typed, and typed themselves only where the tally has
 * nothing to work them out by. Its machine is chosen from the catalog,
 * never typed: a name that chose none stays, in red, and nothing is
 * recorded on it.
 */
export function TokenTallyEditor(props: {
  readonly context: RecordingContext
  readonly at: PlayedAt
  readonly initial: TokenTallyForm
  readonly playId: PlayId
  /** What is written beside the tally that the form does not ask. */
  readonly aside: () => TallyAside
  readonly words: SubmitWords
  readonly submit: (tally: TokenTally) => Promise<Outcome<unknown>>
  readonly onRecorded: (tally: TokenTally) => void
}): JSX.Element {
  const app = useApp()
  const [form, setForm] = createSignal<TokenTallyForm>(props.initial)
  const [submission, setSubmission] = createSignal<Submission>({ type: "editing" })
  const set =
    <K extends keyof TokenTallyForm>(key: K) =>
    (value: TokenTallyForm[K]): void => {
      setForm((current) => ({ ...current, [key]: value }))
    }

  const read = createMemo(() => mapOk(readTokenTallyForm(form(), props.at, props.playId), (tally) => withAside(tally, props.aside())))
  const problemAt = (field: FormField): FieldProblem | undefined => {
    const found = read()
    return found.ok ? undefined : found.error.find((candidate) => candidate.field === field)
  }
  const problemOf = (field: FormField): string | undefined => {
    const problem = problemAt(field)
    return problem === undefined || problem.reason === "required" ? undefined : REASONS[problem.reason]
  }
  const tally = (): TokenTally | undefined => {
    const found = read()
    return found.ok ? found.value : undefined
  }
  const preview = createMemo(() => {
    const found = tally()
    return found === undefined ? undefined : composeTokenTallyEntry(found, pricesPlayedAt(props.at, found.date, props.context.prices))
  })
  const result = createMemo(() => {
    const found = tally()
    const rate = found === undefined ? undefined : props.at.exchangeRateOn(found.date)
    return found === undefined || rate === undefined ? undefined : tokenTallyResultOf(found, rate)
  })
  const resultTone = (): ReturnType<typeof toneOf> | undefined => {
    const yen = result()
    return yen === undefined ? undefined : toneOf(yen)
  }
  const previewText = (): string | undefined => {
    const entry = preview()
    return entry?.ok === true ? renderEntry(entry.value) : undefined
  }
  const previewProblem = (): string | undefined => {
    const entry = preview()
    return entry?.ok === false ? describeTallyError(entry.error) : undefined
  }
  const nudge = createNudge()
  /** Red for a while after a press that a problem here stopped. */
  const nudged = (field: FormField): boolean => nudge.red() && problemAt(field) !== undefined
  const machineMissing = (): boolean => form().machine.trim() === ""
  /** The catalog's machines of the tally's game: all it may name, beside the one it names already. */
  const [catalogued] = createResource(
    () => props.at.gameKind,
    (gameKind) => findMachines(app.services.catalog, "", CATALOG_GAMES[gameKind]),
  )
  const machines = (): readonly MachineSummary[] => {
    const found = catalogued()
    return found?.ok === true && found.value.type === "found" ? found.value.machines : []
  }
  const machineChoices = createMemo(() => machineChoicesOf(machines(), props.initial.machine))
  /** What the machine field holds, chosen or only typed: a name typed that chose no machine stops the tally being recorded. */
  const [machineTyped, setMachineTyped] = createSignal("")
  const machineTypedOnly = (): boolean => holdsTypedOnly(machineTyped(), machineChoices().find((option) => option.value === form().machine)?.label)
  const failure = (): ApplicationError | undefined => {
    const current = submission()
    return current.type === "failed" ? current.error : undefined
  }
  const kind = () => tokenKindOf(props.at.gameKind)
  const unit = (): string => tokenUnit(kind())

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    settleTyping()
    const found = read()
    if (submission().type === "saving") return
    if (!found.ok || preview()?.ok !== true || machineMissing() || machineTypedOnly()) {
      nudge.nudge()
      return
    }
    setSubmission({ type: "saving" })
    const recorded = await props.submit(found.value)
    if (!recorded.ok) {
      setSubmission({ type: "failed", error: recorded.error })
      return
    }
    props.onRecorded(found.value)
  }

  return (
    <form autocomplete="off" class="flex flex-col gap-5 p-4" noValidate onSubmit={(event) => void submit(event)}>
      <p class="text-sm text-text-secondary">
        {props.at.parlor.name}・{props.at.pool.tier}
        {props.at.gameKind === "pachinko" ? "パチンコ" : "スロット"}
      </p>
      <div class="grid grid-cols-[minmax(0,1fr)_6rem] gap-x-3 gap-y-4 sm:grid-cols-[12rem_minmax(0,1fr)_6rem]">
        <TextField label="日付" type="date" value={form().date} onChange={set("date")} error={problemOf("date")}
          invalid={nudged("date")}
          onFocus={nudge.settle} required />
        <div class="order-last col-span-2 sm:order-none sm:col-span-1">
          <Combobox
            label="機種"
            placeholder="機種を選ぶ"
            options={machineChoices()}
            value={form().machine === "" ? undefined : form().machine}
            onChange={(name) => set("machine")(name ?? "")}
            matches={(name, typed) => ((machine) => (machine === undefined ? name.includes(typed.trim()) : machineMatches(machine, typed)))(machines().find((machine) => bookNameOf(machine) === name))}
            invalid={machineTypedOnly() || (nudge.red() && machineMissing())}
            onFocus={nudge.settle}
            onTyped={setMachineTyped}
          />
          <Show when={machineTypedOnly()}>
            <p role="alert" class="mt-1.5 text-xs text-negative">
              {typedMachineRefused("recording")}
            </p>
          </Show>
        </div>
        <TextField label="台番号" value={form().cabinetNumber} onChange={set("cabinetNumber")} inputMode="numeric" />
      </div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
        <div class="flex flex-col gap-1">
          <TextField label="投資額" value={form().outlay} onChange={set("outlay")} inputMode="numeric" suffix="円" error={problemOf("outlay")}
          invalid={nudged("outlay")}
          onFocus={nudge.settle} />
          <Show
            when={props.at.rental !== undefined}
            fallback={
              <TextField label={COUNT_LABELS[kind()].rented} value={form().rentalTokens} onChange={set("rentalTokens")} inputMode="numeric" suffix={unit()} error={problemOf("rental-tokens")} invalid={nudged("rental-tokens")} onFocus={nudge.settle} />
            }
          >
            <Show when={tally()?.rental} keyed>
              {(rental) => <span class="text-xs text-text-muted">貸{unit()} {formatTokens(rental.tokens, kind())}</span>}
            </Show>
          </Show>
        </div>
        <div class="flex flex-col gap-1">
          <TextField
            label="再プレイ（払出数）"
            value={form().replayPaidOut}
            onChange={set("replayPaidOut")}
            inputMode="numeric"
            suffix={unit()}
            error={problemOf("replay-paid-out")}
          invalid={nudged("replay-paid-out")}
          onFocus={nudge.settle}
          />
          <Show
            when={props.at.replay !== undefined}
            fallback={
              <>
                <TextField label={COUNT_LABELS[kind()].deducted} value={form().replayDeducted} onChange={set("replayDeducted")} inputMode="numeric" suffix={unit()} error={problemOf("replay-deducted")} invalid={nudged("replay-deducted")} onFocus={nudge.settle} />
                <span class="text-xs text-text-muted">空欄なら払出数と同じ（手数料なし）</span>
              </>
            }
          >
            <Show when={tally()?.replay.deducted} keyed>
              {(deducted) => <span class="text-xs text-text-muted">貯{unit()}減 {formatTokens(deducted, kind())}</span>}
            </Show>
          </Show>
        </div>
        <TextField label={IN_HAND_LABELS[kind()].carriedIn} value={form().carriedIn} onChange={set("carriedIn")} inputMode="numeric" suffix={unit()} error={problemOf("carried-in")}
          invalid={nudged("carried-in")}
          onFocus={nudge.settle} />
        <TextField label={IN_HAND_LABELS[kind()].left} value={form().payout} onChange={set("payout")} inputMode="numeric" suffix={unit()} error={problemOf("payout")}
          invalid={nudged("payout")}
          onFocus={nudge.settle} />
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">実収支（自動計算）</span>
          <span class="flex h-10 items-center text-lg font-bold tabular-nums" classList={{ "text-positive": resultTone() === "positive", "text-negative": resultTone() === "negative", "text-text-primary": resultTone() === "neutral", "text-text-muted": resultTone() === undefined }}>
            <Show when={result()} keyed fallback={UNSEEN_ACTUAL}>
              {(yen) => formatSignedYen(yen)}
            </Show>
          </span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-4">
        <TextField
          label="期待値"
          value={form().theoreticalValue}
          onChange={set("theoreticalValue")}
          inputMode="decimal"
          suffix="円"
          error={problemOf("theoretical-value")}
          invalid={nudged("theoretical-value")}
          onFocus={nudge.settle}
        />
      </div>
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
