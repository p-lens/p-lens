import { createMemo, createResource, createSignal, type Accessor } from "solid-js"

import type { ApplicationError, Outcome } from "../../../application/errors"
import type { RecordingContext } from "../../../application/record-tally"
import { findMachines } from "../../../application/catalog"
import { listSharedParlors } from "../../../application/shared-parlors"
import { listSubmissions } from "../../../application/submissions"
import type { Weighing, WeighingAsked } from "../../../application/pachinko/inference"
import { bookNameOf, CATALOG_GAMES, type MachineSummary } from "../../../core/catalog/catalog"
import * as Pachinko from "../../../core/pachinko"
import { EMPTY_PARLOR_LIST, type ParlorList } from "../../../core/parlor/shared"
import { renderEntry } from "../../../core/journal/entry"
import { composeYenTallyEntry } from "../../../core/tally/compose"
import type { IsoDate } from "../../../core/calendar/calendar"
import type { TallyAside, TallyError, YenTally } from "../../../core/tally/tally"
import type { PlayGameKind, PlayId } from "../../../core/play/play"
import type { Entry } from "../../../core/journal/entry"
import { mapOk, type Result } from "../../../core/result/result"
import { withAside } from "../../../core/tally/aside"
import { useApp } from "../../context"
import { createNudge, type Nudge } from "../../primitives/nudge"
import { holdsTypedOnly } from "../../primitives/combobox"
import { toast } from "../../primitives/toast"
import { settleTyping } from "../../primitives/text-field"
import { describeTallyError } from "../../wording/errors"
import { formatSignedYen, toneOf, UNSEEN_ACTUAL } from "../../wording/numbers"
import type { TypedNameRefused } from "../../wording/parlor"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import { locateAddress, submitAddress, type LeftFrom } from "../live/submission-return"
import * as PachinkoViews from "../pachinko"
import { offersByKey, parlorOffers, type ParlorOffer } from "./parlor-offers"
import type { FieldProblem, FormField } from "./form"
import { readYenTallyForm, resultOfYenTally, toldFiguresOf, withInferred, type YenTallyForm } from "./yen-tally-form"

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

/** What a press of 推定期待値を算出する needs of the form and has not got, field by field. */
export type Lacking = Readonly<Record<"hours" | "machine" | "outlay" | "theoretical", boolean>>

/** What a tally typed in by its totals is given by the screen it is typed in on: what it starts filled with, what a name typed stops, where the survey brings the person back to, and what recording means. */
export interface YenTallyEditingGiven {
  readonly context: RecordingContext
  /** The parlor list and this device's submissions: with the book's own parlors, all a tally may be said to be at. */
  readonly list: ParlorList
  readonly submissions: readonly KeptSubmission[]
  readonly initial: YenTallyForm
  /** The id of the tally, given the day its play is said to have been played. */
  readonly playIdOn: (date: IsoDate) => PlayId
  /** What is written beside the tally that the form does not ask. */
  readonly aside: () => TallyAside
  readonly refused: TypedNameRefused
  readonly leftFrom: (game: PlayGameKind) => LeftFrom
  readonly submit: (tally: YenTally) => Promise<Outcome<unknown>>
  readonly onRecorded: (tally: YenTally) => void
}

/** A tally being typed in by its totals: the form, what it reads as, what it is weighed to be worth, and its recording — everything the fields of either screen it is typed in on show or change. */
export interface YenTallyEditing {
  readonly form: Accessor<YenTallyForm>
  readonly setForm: (change: (current: YenTallyForm) => YenTallyForm) => void
  readonly set: <K extends keyof YenTallyForm>(key: K) => (value: YenTallyForm[K]) => void
  readonly offers: Accessor<readonly ParlorOffer[]>
  readonly offerOf: Accessor<ReadonlyMap<string, ParlorOffer>>
  readonly setParlorTyped: (typed: string) => void
  /** Whether the parlor field holds a name that was typed and chose no parlor. */
  readonly typedOnly: () => boolean
  readonly locating: () => string | undefined
  readonly submitParlor: () => void
  readonly refused: TypedNameRefused
  readonly machines: () => readonly MachineSummary[]
  readonly switchGame: (gameKind: PlayGameKind) => void
  readonly setMachineTyped: (typed: string) => void
  /** Whether the machine field holds a name that was typed and chose no machine. */
  readonly machineTypedOnly: () => boolean
  readonly problemAt: (field: FormField) => FieldProblem | undefined
  readonly problemOf: (field: FormField) => string | undefined
  readonly nudge: Nudge
  readonly nudged: (field: FormField) => boolean
  readonly weighNudge: Nudge
  readonly lacked: (field: keyof Lacking) => boolean
  readonly weighing: Accessor<Weighing>
  readonly weigh: () => void
  readonly jackpotsAsked: Accessor<boolean>
  /** Whether the tally's play was weighed without its jackpots, which would have read it closer. */
  readonly jackpotsWouldSharpen: Accessor<boolean>
  readonly weighingSet: () => boolean
  readonly resultText: () => string
  readonly resultTone: () => ReturnType<typeof toneOf> | undefined
  readonly previewText: () => string | undefined
  readonly previewProblem: () => string | undefined
  readonly failure: () => ApplicationError | undefined
  readonly saving: () => boolean
  readonly submit: (event: SubmitEvent) => Promise<void>
}

/**
 * A tally added by its totals, wherever it is added from. Its parlor is
 * chosen as a play started live chooses one — from the parlor list, the
 * book's own parlors and this device's submissions — and never typed: a
 * name that chose none stays, in red, and nothing is recorded on it. Its
 * machine is one of the catalog's, of the game chosen, or none; a machine
 * the catalog lacks is registered there first, with a formula, like any
 * other.
 */
export const createYenTallyEditing = (given: YenTallyEditingGiven): YenTallyEditing => {
  const app = useApp()
  const [form, setForm] = createSignal<YenTallyForm>(given.initial)
  const [submission, setSubmission] = createSignal<Submission>({ type: "editing" })
  const set =
    <K extends keyof YenTallyForm>(key: K) =>
    (value: YenTallyForm[K]): void => {
      setForm((current) => ({ ...current, [key]: value }))
    }

  /** Where the device is, asked once: the parlors are offered nearest first where it says, and by prefecture where it does not. */
  const [here] = createResource(() => app.services.locate())
  const offers = createMemo(() => {
    const found = here()
    return parlorOffers(given.context.parlors, given.list, given.submissions, found?.ok === true ? found.value : undefined)
  })
  const offerOf = createMemo(() => offersByKey(offers()))
  /** What the parlor field holds, chosen or only typed: a name typed that chose no parlor stops the tally being recorded. */
  const [parlorTyped, setParlorTyped] = createSignal("")
  const chosenName = (): string | undefined => offerOf().get(form().parlorKey)?.parlor.name
  /** Where to report the chosen parlor's position, where the list has it without one and there is a survey to report it at. */
  const locating = (): string | undefined => {
    const unplaced = offerOf().get(form().parlorKey)?.unplaced
    return unplaced === undefined || app.services.surveyUrl === undefined ? undefined : locateAddress(app.services.surveyUrl, window.location.origin, given.leftFrom(form().gameKind), unplaced)
  }
  const typedOnly = (): boolean => holdsTypedOnly(parlorTyped(), chosenName())
  /** Off to survey.p-lens.jp to submit a parlor the list lacks; a build that names no survey says so instead of going nowhere. */
  const submitParlor = (): void => {
    if (app.services.surveyUrl === undefined) {
      toast({ title: "店舗の申請はまだ準備中です", description: "一覧にない店舗は、店舗を指定せずに記録できます。" })
      return
    }
    window.location.assign(submitAddress(app.services.surveyUrl, window.location.origin, given.leftFrom(form().gameKind)))
  }
  /** The catalog's machines of the game chosen: all a tally added by its totals may name. */
  const [catalogued] = createResource(
    () => form().gameKind,
    (gameKind) => findMachines(app.services.catalog, "", CATALOG_GAMES[gameKind]),
  )
  const machines = (): readonly MachineSummary[] => {
    const found = catalogued()
    return found?.ok === true && found.value.type === "found" ? found.value.machines : []
  }
  /** What the machine field holds, chosen or only typed: a name typed that chose no machine stops the tally being recorded. */
  const [machineTyped, setMachineTyped] = createSignal("")
  /** What the machine field says of the machine chosen: the name the halls call it, though the tally keeps its model name. */
  const chosenMachineLabel = (): string | undefined => machines().find((machine) => bookNameOf(machine) === form().machine)?.name
  const machineTypedOnly = (): boolean => holdsTypedOnly(machineTyped(), chosenMachineLabel())
  /** Makes the tally one of the other game: the form as it began where a machine had been chosen or typed — nothing of a tally of the one game is sure of the other — and the game alone where none had. */
  const switchGame = (gameKind: PlayGameKind): void => {
    const begunAgain = form().machine !== "" || machineTyped().trim() !== ""
    setMachineTyped("")
    setForm((current) => (begunAgain ? { ...given.initial, gameKind, machine: "" } : { ...current, gameKind }))
  }
  const offeredParlors = createMemo(() => offers().map((offer) => offer.parlor))
  const read = createMemo(() => mapOk(readYenTallyForm(form(), offeredParlors(), given.playIdOn), (tally) => withAside(tally, given.aside())))
  const problemAt = (field: FormField): FieldProblem | undefined => {
    const found = read()
    return found.ok ? undefined : found.error.find((candidate) => candidate.field === field)
  }
  const problemOf = (field: FormField): string | undefined => {
    const problem = problemAt(field)
    return problem === undefined || problem.reason === "required" ? undefined : REASONS[problem.reason]
  }
  /** The catalog's id of the machine chosen, as a value of its own. */
  const machineId = createMemo((): string | undefined => machines().find((machine) => bookNameOf(machine) === form().machine)?.id)
  /** The play to weigh for what it was worth: a pachinko tally's, of a catalog's machine, whose hours are said and whose theoretical value is not — one typed in is the tally's, and nothing is inferred beside it. */
  const asked = createMemo((): WeighingAsked | undefined => {
    const tally = read()
    const chosen = machineId()
    if (!tally.ok || tally.value.gameKind !== "pachinko" || tally.value.theoreticalValue !== undefined || chosen === undefined) return undefined
    const told = toldFiguresOf(tally.value)
    return told === undefined ? undefined : { machineId: chosen, playId: tally.value.id, told, terms: form().weighingTerms }
  })
  const weigher = PachinkoViews.createWeighing(asked)
  const weighing = weigher.weighing
  /** What a press of 推定期待値を算出する needs of the form and has not got: the play's hours, its machine, the cash it took — and no theoretical value typed in, which is the tally's own and leaves nothing to infer. */
  const lacking = (): Lacking => ({ hours: form().hours === "", machine: machineId() === undefined, outlay: problemAt("outlay") !== undefined || form().outlay.trim() === "", theoretical: form().theoreticalValue.trim() !== "" })
  const weighNudge = createNudge()
  const nudge = createNudge()
  /** Red for a while after a press of 推定期待値を算出する that this stopped. */
  const lacked = (field: keyof Lacking): boolean => weighNudge.red() && lacking()[field]
  /** Begin the weighing; where the form has not got what it needs, that is shown in red and nothing is begun — and where what stops it is anything else of the form, that is shown as a press to record shows it. */
  const weigh = (): void => {
    settleTyping()
    if (asked() !== undefined) return weigher.weigh()
    if (Object.values(lacking()).some((lacks) => lacks)) return weighNudge.nudge()
    nudge.nudge()
  }
  /** The tally as it is written: what the form reads, with what it was weighed to be worth once it has been. */
  const weighedRead = createMemo(() => {
    const tally = read()
    const now = weighing()
    return tally.ok && now.type === "weighed" ? { ok: true as const, value: withInferred(tally.value, Pachinko.inferredWorthOf(now.weighed, now.formulaId, form().weighingTerms)) } : tally
  })
  const preview = createMemo((): Result<Entry, TallyError> | undefined => {
    const tally = weighedRead()
    return tally.ok ? composeYenTallyEntry(tally.value) : undefined
  })
  /** Whether the weighing has just asked for the jackpots: it read too little from a play told without them. */
  const jackpotsAsked = createMemo((): boolean => ((now) => now.type === "vague" && !now.jackpotsTold)(weighing()))
  const jackpotsWouldSharpen = createMemo((): boolean => weighing().type === "weighed" && form().jackpots.trim() === "")
  /** Whether anything is set of what a weighing may be told beside the form's own fields: the jackpots, or terms other than the usual. */
  const weighingSet = (): boolean => form().jackpots.trim() !== "" || form().weighingTerms.rental !== Pachinko.TERMS_BY_DEFAULT.rental || form().weighingTerms.exchange !== Pachinko.TERMS_BY_DEFAULT.exchange
  const previewText = (): string | undefined => {
    const entry = preview()
    return entry?.ok === true ? renderEntry(entry.value) : undefined
  }
  const previewProblem = (): string | undefined => {
    const entry = preview()
    return entry?.ok === false ? describeTallyError(entry.error) : undefined
  }
  /** The result the two sides come to, or dashes in its shape while they do not read. */
  const resultText = (): string => ((result) => (result === undefined ? UNSEEN_ACTUAL : formatSignedYen(result)))(resultOfYenTally(form()))
  /** Which way the result went, or no way while the two sides do not read. */
  const resultTone = (): ReturnType<typeof toneOf> | undefined => ((result) => (result === undefined ? undefined : toneOf(result)))(resultOfYenTally(form()))
  /** Red for a while after a press that a problem here stopped. */
  const nudged = (field: FormField): boolean => nudge.red() && problemAt(field) !== undefined
  const failure = (): ApplicationError | undefined => {
    const current = submission()
    return current.type === "failed" ? current.error : undefined
  }

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    settleTyping()
    const tally = weighedRead()
    if (submission().type === "saving" || weighing().type === "weighing") return
    if (!tally.ok || preview()?.ok !== true || typedOnly() || machineTypedOnly()) {
      nudge.nudge()
      return
    }
    setSubmission({ type: "saving" })
    const recorded = await given.submit(tally.value)
    if (!recorded.ok) {
      setSubmission({ type: "failed", error: recorded.error })
      return
    }
    given.onRecorded(tally.value)
  }

  return {
    form,
    setForm,
    set,
    offers,
    offerOf,
    setParlorTyped,
    typedOnly,
    locating,
    submitParlor,
    refused: given.refused,
    machines,
    switchGame,
    setMachineTyped,
    machineTypedOnly,
    problemAt,
    problemOf,
    nudge,
    nudged,
    weighNudge,
    lacked,
    weighing,
    weigh,
    jackpotsAsked,
    jackpotsWouldSharpen,
    weighingSet,
    resultText,
    resultTone,
    previewText,
    previewProblem,
    failure,
    saving: () => submission().type === "saving",
    submit,
  }
}

/**
 * The parlor list and this device's submissions, read for a form that
 * offers them: an empty list where it could not be read, since a tally
 * may name no parlor.
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
