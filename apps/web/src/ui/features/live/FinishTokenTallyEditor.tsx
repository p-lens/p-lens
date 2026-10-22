import { createMemo, createResource, createSignal, Show, type Accessor, type JSX } from "solid-js"

import type { ApplicationError, Outcome } from "../../../application/errors"
import type { RecordingContext } from "../../../application/record-tally"
import { findMachines } from "../../../application/catalog"
import { bookNameOf, type MachineSummary } from "../../../core/catalog/catalog"
import { machineMatches } from "../../../core/catalog/description"
import { renderEntry } from "../../../core/journal/entry"
import { composeTokenTallyEntry } from "../../../core/tally/compose"
import { tokenTallyResultOf } from "../../../core/tally/result"
import { withAside } from "../../../core/tally/aside"
import type { TallyAside, TokenTally } from "../../../core/tally/tally"
import { tokenKindOf, type PlayId } from "../../../core/play/play"
import { mapOk } from "../../../core/result/result"
import { useApp } from "../../context"
import { holdsTypedOnly } from "../../primitives/combobox"
import { createNudge } from "../../primitives/nudge"
import { settleTyping } from "../../primitives/text-field"
import { describeTallyError } from "../../wording/errors"
import { FIELD_PROBLEM_TEXT } from "../../wording/fields"
import { formatSignedYen, formatTokens, toneOf, tokenUnit, UNSEEN_ACTUAL } from "../../wording/numbers"
import { machineChoicesOf, type FieldProblem, type FormField, type SubmitWords } from "./finish-tally-reading"
import { FinishTallyForm, type FinishTallyEditing } from "./FinishTallyForm"
import { pricesPlayedOn, readFinishTokenTallyForm, type FinishTokenTallyForm, type PlayedOnTerms } from "./finish-token-tally-form"
import { createFollowedWorth, heldTyped, type WorthAt } from "./followed-worth"

/** Where a submission is: being typed, being written, or refused with why. */
type Submission =
  | { readonly type: "editing" }
  | { readonly type: "saving" }
  | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * The form a play followed live at a parlor is recorded with, in tokens:
 * where and on what terms are its play's and shown as such; the tokens
 * rented and the savings a replay took are worked out from those terms as
 * the sums are typed. Its machine is chosen from the catalog, never typed: a name that
 * chose none stays, in red, and nothing is recorded on it.
 */
export function FinishTokenTallyEditor(props: {
  readonly context: RecordingContext
  readonly at: PlayedOnTerms
  /** Whether the form says where the play was: not where the parlor was chosen above it as the play was recorded. */
  readonly namesPlace: boolean
  readonly initial: FinishTokenTallyForm
  readonly playId: PlayId
  /** What is written beside the tally that the form does not ask. */
  readonly aside: () => TallyAside
  readonly words: SubmitWords
  /** What the play comes to finished as said above the form, asked again as what is typed here changes. */
  readonly worthAt: Accessor<WorthAt>
  readonly submit: (tally: TokenTally) => Promise<Outcome<unknown>>
  readonly onRecorded: (tally: TokenTally) => void
}): JSX.Element {
  const app = useApp()
  const [form, setForm] = createSignal<FinishTokenTallyForm>(props.initial)
  const [submission, setSubmission] = createSignal<Submission>({ type: "editing" })
  const fill =
    <K extends keyof FinishTokenTallyForm>(key: K) =>
    (value: FinishTokenTallyForm[K]): void => {
      setForm((current) => ({ ...current, [key]: value }))
    }
  const worth = createFollowedWorth({ worthAt: props.worthAt, held: () => heldTyped(form().payout), fill: fill("theoreticalValue") })
  const set =
    <K extends keyof FinishTokenTallyForm>(key: K) =>
    (value: FinishTokenTallyForm[K]): void => {
      if (key === "theoreticalValue") worth.typedByPerson()
      fill(key)(value)
    }

  const read = createMemo(() => mapOk(readFinishTokenTallyForm(form(), props.at, props.playId), (tally) => withAside(tally, props.aside())))
  const problemAt = (field: FormField): FieldProblem | undefined => {
    const found = read()
    return found.ok ? undefined : found.error.find((candidate) => candidate.field === field)
  }
  const problemOf = (field: FormField): string | undefined => {
    const problem = problemAt(field)
    return problem === undefined || problem.reason === "required" ? undefined : FIELD_PROBLEM_TEXT[problem.reason]
  }
  const tally = (): TokenTally | undefined => {
    const found = read()
    return found.ok ? found.value : undefined
  }
  const preview = createMemo(() => {
    const found = tally()
    return found === undefined ? undefined : composeTokenTallyEntry(found, pricesPlayedOn(props.at, found.date, props.context.prices))
  })
  const result = createMemo(() => {
    const found = tally()
    return found === undefined ? undefined : tokenTallyResultOf(found, props.at.exchangeRate)
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
    (gameKind) => findMachines(app.services.catalog, "", gameKind),
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
    if (submission().type === "saving") return
    if (!read().ok || preview()?.ok !== true || machineMissing() || machineTypedOnly()) {
      nudge.nudge()
      return
    }
    setSubmission({ type: "saving" })
    await worth.settled()
    const found = read()
    if (!found.ok) {
      setSubmission({ type: "editing" })
      nudge.nudge()
      return
    }
    const recorded = await props.submit(found.value)
    if (!recorded.ok) {
      setSubmission({ type: "failed", error: recorded.error })
      return
    }
    props.onRecorded(found.value)
  }

  const editing: FinishTallyEditing = {
    value: (field) => form()[field],
    set: (field) => set(field),
    problemAt,
    problemOf,
    nudge,
    nudged,
    machineChoices,
    machineMatches: (name, typed) => ((machine) => (machine === undefined ? name.includes(typed.trim()) : machineMatches(machine, typed)))(machines().find((machine) => bookNameOf(machine) === name)),
    setMachineTyped,
    machineTypedOnly,
    machineLacked: () => nudge.red() && machineMissing(),
    machineRequired: true,
    resultText: () => ((yen) => (yen === undefined ? UNSEEN_ACTUAL : formatSignedYen(yen)))(result()),
    resultTone,
    previewText,
    previewProblem,
    failure,
    saving: () => submission().type === "saving",
    submit,
  }
  return (
    <FinishTallyForm
      editing={editing}
      gameKind={props.at.gameKind}
      words={props.words}
      place={
        <Show when={props.namesPlace}>
          <p class="text-sm text-text-secondary">
            {props.at.parlor.name}・{props.at.pool.tier}
            {props.at.gameKind === "pachinko" ? "パチンコ" : "スロット"}
          </p>
        </Show>
      }
      outlayBeside={
        <Show when={tally()?.rental} keyed>
          {(rental) => <span class="text-xs text-text-muted">貸{unit()} {formatTokens(rental.tokens, kind())}</span>}
        </Show>
      }
      savings={{ deducted: () => tally()?.replay.deducted }}
    />
  )
}
