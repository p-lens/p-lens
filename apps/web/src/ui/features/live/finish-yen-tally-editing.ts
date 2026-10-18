import { createMemo, createResource, createSignal, type Accessor } from "solid-js"

import type { ApplicationError, Outcome } from "../../../application/errors"
import { findMachines } from "../../../application/catalog"
import { bookNameOf, CATALOG_GAMES, type MachineSummary } from "../../../core/catalog/catalog"
import { machineMatches } from "../../../core/catalog/description"
import type { Decimal } from "../../../core/decimal/decimal"
import { renderEntry, type Entry } from "../../../core/journal/entry"
import type { PlayTerms } from "../../../core/parlor/terms"
import { composeYenTallyEntry } from "../../../core/tally/compose"
import type { TallyAside, TallyError, YenTally } from "../../../core/tally/tally"
import type { PlayId } from "../../../core/play/play"
import { mapOk, type Result } from "../../../core/result/result"
import { withAside } from "../../../core/tally/aside"
import { useApp } from "../../context"
import { createNudge } from "../../primitives/nudge"
import { holdsTypedOnly } from "../../primitives/combobox"
import { settleTyping } from "../../primitives/text-field"
import { describeTallyError } from "../../wording/errors"
import { FIELD_PROBLEM_TEXT } from "../../wording/fields"
import { formatSignedYen, toneOf, UNSEEN_ACTUAL } from "../../wording/numbers"
import { machineChoicesOf, type FieldProblem, type FormField } from "./finish-tally-reading"
import { exchangedFrom, heldIn, offBookDeductedOf, oddPrizesOf, offTheRate, readFinishYenTallyForm, rentedOf, resultOfFinishYenTally, type FinishYenTallyForm } from "./finish-yen-tally-form"
import { createFollowedWorth, type WorthAt } from "./followed-worth"
import type { FinishTallyEditing } from "./FinishTallyForm"
import type { ParlorChoice } from "./parlor-choice"

/** Where a submission is: being typed, being written, or refused with why. */
type Submission =
  | { readonly type: "editing" }
  | { readonly type: "saving" }
  | { readonly type: "failed"; readonly error: ApplicationError }

/** What a play followed live is given to be recorded by its totals in yen: what it starts filled with, its terms where it has them, the parlor chosen for it, and what recording means. */
interface FinishYenTallyEditingGiven {
  readonly initial: FinishYenTallyForm
  readonly terms: PlayTerms | undefined
  readonly parlor: ParlorChoice
  readonly playId: PlayId
  /** What is written beside the tally that the form does not ask. */
  readonly aside: () => TallyAside
  /** What the play comes to finished as said above the form, asked again as what is typed here changes. */
  readonly worthAt: Accessor<WorthAt>
  /** Given the tokens in hand as the play finished, where it is counted by them. */
  readonly submit: (tally: YenTally, held: number | undefined) => Promise<Outcome<unknown>>
  readonly onRecorded: (tally: YenTally) => void
}

/** A play followed live being recorded by its totals in yen: the form every play is recorded with, the savings a draw took, and the yen typed as come back where it counts no tokens. */
interface FinishYenTallyEditing {
  readonly tally: FinishTallyEditing
  /** The savings the book does not keep that a draw took, where the play has terms. */
  readonly deducted: () => Decimal | undefined
  /** The tokens the cash spent rented, where the play has terms. */
  readonly rented: () => Decimal | undefined
  readonly takings: () => string
  readonly setTakings: (typed: string) => void
  /** The tokens in hand as typed. */
  readonly payout: () => string
  /** Whether the tokens in hand were exchanged for prizes at the counter, and the prizes typed. */
  readonly exchanged: () => boolean
  readonly setExchanged: (exchanged: boolean) => void
  /** The count handed over at the counter: begun as the tokens in hand each time the tokens are said to be exchanged. */
  readonly exchangedTokens: () => string
  readonly setExchangedTokens: (typed: string) => void
  readonly specialPrizes: () => string
  readonly setSpecialPrizes: (typed: string) => void
  /** The odd prizes worked out at the rate beside the special prizes typed; none while they do not read. */
  readonly oddPrizes: () => Decimal | undefined
  /** Whether the exchange typed cannot have been at the play's rate. */
  readonly offTheRate: () => boolean
}

/**
 * A play followed live at no parlor, recorded by its totals in yen. Its
 * game is the one it was followed as; its machine is one of the catalog's,
 * of that game, or none. What it drew from savings comes from savings the
 * book does not keep (簿外貯玉). What it was worth is the one its log
 * measured, and nothing is inferred here.
 */
export const createFinishYenTallyEditing = (given: FinishYenTallyEditingGiven): FinishYenTallyEditing => {
  const app = useApp()
  const [form, setForm] = createSignal<FinishYenTallyForm>(given.initial)
  const [submission, setSubmission] = createSignal<Submission>({ type: "editing" })
  const fill =
    <K extends keyof FinishYenTallyForm>(key: K) =>
    (value: FinishYenTallyForm[K]): void => {
      setForm((current) => ({ ...current, [key]: value }))
    }
  /** The tokens in hand as the play finished, where it is counted by them: a play with terms. */
  const held = (): number | undefined => (given.terms === undefined ? undefined : heldIn({ payout: form().payout }))
  const worth = createFollowedWorth({ worthAt: given.worthAt, held, fill: fill("theoreticalValue") })
  const set =
    <K extends keyof FinishYenTallyForm>(key: K) =>
    (value: FinishYenTallyForm[K]): void => {
      if (key === "theoreticalValue") worth.typedByPerson()
      fill(key)(value)
    }
  /** The catalog's machines of the play's game: all it may name. */
  const [catalogued] = createResource(
    () => form().gameKind,
    (gameKind) => findMachines(app.services.catalog, "", CATALOG_GAMES[gameKind]),
  )
  const machines = (): readonly MachineSummary[] => {
    const found = catalogued()
    return found?.ok === true && found.value.type === "found" ? found.value.machines : []
  }
  const machineChoices = createMemo(() => machineChoicesOf(machines(), given.initial.machine))
  /** What the machine field holds, chosen or only typed: a name typed that chose no machine stops the tally being recorded. */
  const [machineTyped, setMachineTyped] = createSignal("")
  const machineTypedOnly = (): boolean => holdsTypedOnly(machineTyped(), machineChoices().find((option) => option.value === form().machine)?.label)
  const read = createMemo(() => mapOk(readFinishYenTallyForm(form(), given.terms, given.parlor.chosen(), given.playId), (tally) => withAside(tally, given.aside())))
  const problemAt = (field: FormField): FieldProblem | undefined => {
    const found = read()
    return found.ok ? undefined : found.error.find((candidate) => candidate.field === field)
  }
  const problemOf = (field: FormField): string | undefined => {
    const problem = problemAt(field)
    return problem === undefined || problem.reason === "required" ? undefined : FIELD_PROBLEM_TEXT[problem.reason]
  }
  const nudge = createNudge()
  const preview = createMemo((): Result<Entry, TallyError> | undefined => {
    const tally = read()
    return tally.ok ? composeYenTallyEntry(tally.value) : undefined
  })
  const result = (): ReturnType<typeof resultOfFinishYenTally> => resultOfFinishYenTally(form(), given.terms)

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    settleTyping()
    if (submission().type === "saving") return
    if (!read().ok || preview()?.ok !== true || given.parlor.typedOnly() || machineTypedOnly()) {
      nudge.nudge()
      return
    }
    setSubmission({ type: "saving" })
    await worth.settled()
    const tally = read()
    if (!tally.ok) {
      setSubmission({ type: "editing" })
      nudge.nudge()
      return
    }
    const recorded = await given.submit(tally.value, held())
    if (!recorded.ok) {
      setSubmission({ type: "failed", error: recorded.error })
      return
    }
    given.onRecorded(tally.value)
  }

  return {
    tally: {
      value: (field) => form()[field],
      set: (field) => set(field),
      problemAt,
      problemOf,
      nudge,
      nudged: (field) => nudge.red() && problemAt(field) !== undefined,
      machineChoices,
      machineMatches: (name, typed) => ((machine) => (machine === undefined ? name.includes(typed.trim()) : machineMatches(machine, typed)))(machines().find((machine) => bookNameOf(machine) === name)),
      setMachineTyped,
      machineTypedOnly,
      machineLacked: () => false,
      machineRequired: false,
      resultText: () => ((yen) => (yen === undefined ? UNSEEN_ACTUAL : formatSignedYen(yen)))(result()),
      resultTone: () => ((yen) => (yen === undefined ? undefined : toneOf(yen)))(result()),
      previewText: () => ((entry) => (entry?.ok === true ? renderEntry(entry.value) : undefined))(preview()),
      previewProblem: () => ((entry) => (entry?.ok === false ? describeTallyError(entry.error) : undefined))(preview()),
      failure: () => ((current) => (current.type === "failed" ? current.error : undefined))(submission()),
      saving: () => submission().type === "saving",
      submit,
    },
    deducted: () => (given.terms === undefined ? undefined : offBookDeductedOf(form(), given.terms)),
    rented: () => (given.terms === undefined ? undefined : rentedOf(form(), given.terms)),
    takings: () => form().takings,
    setTakings: set("takings"),
    payout: () => form().payout,
    exchanged: () => form().exchanged,
    setExchanged: (exchanged) => setForm((current) => (exchanged ? exchangedFrom(current) : { ...current, exchanged })),
    exchangedTokens: () => form().exchangedTokens,
    setExchangedTokens: set("exchangedTokens"),
    specialPrizes: () => form().specialPrizes,
    setSpecialPrizes: set("specialPrizes"),
    oddPrizes: () => (given.terms === undefined ? undefined : oddPrizesOf(form(), given.terms)),
    offTheRate: () => given.terms !== undefined && offTheRate(form(), given.terms),
  }
}
