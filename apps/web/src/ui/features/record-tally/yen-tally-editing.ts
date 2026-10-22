import { createMemo, createResource, createSignal, type Accessor } from "solid-js"

import type { ApplicationError, Outcome } from "../../../application/errors"
import type { TermsUsed } from "../../../application/inference-terms"
import type { RecordingContext } from "../../../application/record-tally"
import { findMachines } from "../../../application/catalog"
import type { Weighing, WeighingAsked } from "../../../application/pachinko/inference"
import { loadInferable, type Inferable, type SettingInference } from "../../../application/pachislot/setting-inference"
import { bookNameOf, type MachineSummary } from "../../../core/catalog/catalog"
import * as Pachinko from "../../../core/pachinko"
import * as Pachislot from "../../../core/pachislot"
import type { ParlorList } from "../../../core/parlor/shared"
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
import { FIELD_PROBLEM_TEXT } from "../../wording/fields"
import { formatSignedYen, toneOf, UNSEEN_ACTUAL } from "../../wording/numbers"
import type { TypedNameRefused } from "../../wording/parlor"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import { locateAddress, submitAddress, type LeftFrom } from "../live/submission-return"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"
import { offersByKey, parlorOffers, type ParlorOffer } from "../parlor-offers/parlor-offers"
import type { FieldProblem, FormField } from "./form"
import { atToldOf, medalTermsFormOf, pachislotToldOf, readMedalTerms, readWeighingTerms, readYenTallyForm, resultOfYenTally, termsTypedOf, toldFiguresOf, weighingTermsFormOf, withInferred, type YenTallyForm } from "./yen-tally-form"

/** Where a submission is: being typed, being written, or refused with why. */
type Submission =
  | { readonly type: "editing" }
  | { readonly type: "saving" }
  | { readonly type: "failed"; readonly error: ApplicationError }

/** What a press that reads a play needs of the form and has not got, field by field: 推定期待値を算出する for pachinko, the setting level's for pachislot. */
export type Lacking = Readonly<Record<"hours" | "machine" | "outlay" | "theoretical" | "counter" | "terms", boolean>>

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
  /** Record the tally, with the terms of its game as the form says them where they read, for the book to keep. */
  readonly submit: (tally: YenTally, used: TermsUsed | undefined) => Promise<Outcome<unknown>>
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
  /** The formula a pachislot tally's machine reads its setting level by, where one is chosen: none, an AT machine, or one to read. */
  readonly inferable: Accessor<Inferable | undefined>
  readonly settingInference: Accessor<SettingInference>
  readonly atMachine: () => boolean
  /** Whether an AT machine's history was read with an AT whose CZ misses were not counted, which would have read it closer. */
  readonly missesWouldSharpen: Accessor<boolean>
  /** The bonuses the data counter of a pachislot machine chosen shows, as its formula names them. */
  readonly counterBonuses: () => readonly Pachislot.Countable[]
  /** Whether anything is set of what a pachislot setting level is read from beside the form's own fields: the counter, or terms other than the usual. */
  readonly counterSet: () => boolean
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
    (gameKind) => findMachines(app.services.catalog, "", gameKind),
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
    return problem === undefined || problem.reason === "required" ? undefined : FIELD_PROBLEM_TEXT[problem.reason]
  }
  /** The catalog's id of the machine chosen, as a value of its own. */
  const machineId = createMemo((): string | undefined => machines().find((machine) => bookNameOf(machine) === form().machine)?.id)
  /** The play to weigh for what it was worth: a pachinko tally's, of a catalog's machine, whose hours are said and whose theoretical value is not — one typed in is the tally's, and nothing is inferred beside it. */
  const asked = createMemo((): WeighingAsked | undefined => {
    const tally = read()
    const chosen = machineId()
    if (!tally.ok || tally.value.gameKind !== "pachinko" || tally.value.theoreticalValue !== undefined || chosen === undefined) return undefined
    const told = toldFiguresOf(tally.value)
    const terms = readWeighingTerms(form().weighingTerms)
    return told === undefined || terms === undefined ? undefined : { machineId: chosen, playId: tally.value.id, told, terms }
  })
  const weigher = PachinkoViews.createWeighing(asked)
  const weighing = weigher.weighing
  /** The formula a pachislot machine chosen reads its setting level by. */
  const [inferableFound] = createResource(
    () => (form().gameKind === "pachislot" ? machineId() : undefined),
    (chosen) => loadInferable(app.services.catalog, chosen),
  )
  const inferable = (): Inferable | undefined => ((found) => (found?.ok === true ? found.value : undefined))(inferableFound())
  const counterBonuses = (): readonly Pachislot.Countable[] => ((found) => (found?.type === "inferable" ? Pachislot.counterBonusesOf(found.formula) : []))(inferable())
  const counterBonusIds = (): readonly string[] => counterBonuses().map((bonus) => bonus.id)
  /** Whether the pachislot machine chosen is an AT machine, read by its history rather than its counter. */
  const atMachine = (): boolean => ((found) => found?.type === "inferable" && found.formula.normalized.atRules !== undefined)(inferable())
  /** What a pachislot tally tells its setting level by, where it tells enough: an AT machine's history, or a bonus machine's counter with its hours. */
  const settingTold = (): Pachislot.SettingTold | undefined => {
    if (atMachine()) return ((told) => (told === undefined ? undefined : { type: "history" as const, told }))(atToldOf(form()))
    return ((told) => (told === undefined ? undefined : { type: "counter" as const, told }))(pachislotToldOf(form(), counterBonusIds()))
  }
  /** The play to read the setting level of: a pachislot tally's, of a machine of the catalog, that tells enough and whose theoretical value is not typed in. */
  const settingAsked = createMemo((): PachislotViews.SettingAsked | undefined => {
    const tally = read()
    const found = inferable()
    const terms = readMedalTerms(form().medalTerms)
    const told = settingTold()
    if (!tally.ok || tally.value.gameKind !== "pachislot" || tally.value.theoreticalValue !== undefined || found?.type !== "inferable" || terms === undefined || told === undefined) return undefined
    return { formula: found.formula, told, terms }
  })
  const settingInferer = PachislotViews.createSettingInference(settingAsked)
  const settingInference = settingInferer.inference
  /** What a press of 推定期待値を算出する needs of the form and has not got: the play's hours, its machine, the cash it took — and no theoretical value typed in, which is the tally's own and leaves nothing to infer. */
  const lacking = (): Lacking =>
    form().gameKind === "pachislot"
      ? {
          hours: !atMachine() && form().hours === "",
          machine: inferable()?.type !== "inferable",
          outlay: false,
          theoretical: form().theoreticalValue.trim() !== "",
          counter: atMachine() ? atToldOf(form()) === undefined : pachislotToldOf({ ...form(), hours: "1" }, counterBonusIds()) === undefined,
          terms: readMedalTerms(form().medalTerms) === undefined,
        }
      : {
          hours: form().hours === "",
          machine: machineId() === undefined,
          outlay: problemAt("outlay") !== undefined || form().outlay.trim() === "",
          theoretical: form().theoreticalValue.trim() !== "",
          counter: false,
          terms: readWeighingTerms(form().weighingTerms) === undefined,
        }
  const weighNudge = createNudge()
  const nudge = createNudge()
  /** Red for a while after a press of 推定期待値を算出する that this stopped. */
  const lacked = (field: keyof Lacking): boolean => weighNudge.red() && lacking()[field]
  /** Begin the weighing; where the form has not got what it needs, that is shown in red and nothing is begun — and where what stops it is anything else of the form, that is shown as a press to record shows it. */
  const weigh = (): void => {
    settleTyping()
    if (form().gameKind === "pachislot" && settingAsked() !== undefined) return settingInferer.infer()
    if (form().gameKind === "pachinko" && asked() !== undefined) return weigher.weigh()
    if (Object.values(lacking()).some((lacks) => lacks)) return weighNudge.nudge()
    nudge.nudge()
  }
  /** The tally as it is written: what the form reads, with what it was weighed to be worth once it has been. */
  const weighedRead = createMemo(() => {
    const tally = read()
    const now = weighing()
    const setting = settingInference()
    const terms = readMedalTerms(form().medalTerms)
    const weighingTerms = readWeighingTerms(form().weighingTerms)
    if (tally.ok && tally.value.gameKind === "pachislot" && setting.type === "inferred" && terms !== undefined) return { ok: true as const, value: withInferred(tally.value, Pachislot.inferredWorthOf(setting.inferred.formulaId, setting.inferred.theoreticalValue, terms)) }
    return tally.ok && tally.value.gameKind === "pachinko" && now.type === "weighed" && weighingTerms !== undefined ? { ok: true as const, value: withInferred(tally.value, Pachinko.inferredWorthOf(now.weighed, now.formulaId, weighingTerms)) } : tally
  })
  const preview = createMemo((): Result<Entry, TallyError> | undefined => {
    const tally = weighedRead()
    return tally.ok ? composeYenTallyEntry(tally.value) : undefined
  })
  /** Whether the weighing has just asked for the jackpots: it read too little from a play told without them. */
  const jackpotsAsked = createMemo((): boolean => ((now) => now.type === "vague" && !now.jackpotsTold)(weighing()))
  const jackpotsWouldSharpen = createMemo((): boolean => weighing().type === "weighed" && form().jackpots.trim() === "")
  /** Whether an AT machine's history was read with an AT whose misses were not counted, where its machine has a trigger they would have read it closer by. */
  const missesWouldSharpen = createMemo(
    (): boolean =>
      settingInference().type === "inferred" &&
      ((found) => found?.type === "inferable" && found.formula.normalized.atRules?.trigger !== undefined)(inferable()) &&
      form().atHistory.ats.some((at) => at.games.trim() !== "" && at.misses.trim() === ""),
  )
  const counterSet = (): boolean =>
    form().atHistory.sinceAt.trim() !== "" ||
    form().atHistory.afterReset ||
    form().atHistory.ats.length > 0 ||
    form().atHistory.since.trim() !== "" ||
    form().counterGames.trim() !== "" ||
    Object.values(form().counterBonuses).some((count) => count.trim() !== "") ||
    form().medalTerms.rentedPerThousand !== medalTermsFormOf(Pachislot.MEDAL_TERMS_BY_DEFAULT).rentedPerThousand ||
    form().medalTerms.exchangedPerHundred !== medalTermsFormOf(Pachislot.MEDAL_TERMS_BY_DEFAULT).exchangedPerHundred
  /** Whether anything is set of what a weighing may be told beside the form's own fields: the jackpots, or terms other than the usual. */
  const weighingSet = (): boolean =>
    form().jackpots.trim() !== "" ||
    form().weighingTerms.rentedPerThousand !== weighingTermsFormOf(Pachinko.TERMS_BY_DEFAULT).rentedPerThousand ||
    form().weighingTerms.exchangedPerHundred !== weighingTermsFormOf(Pachinko.TERMS_BY_DEFAULT).exchangedPerHundred
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
    if (submission().type === "saving" || weighing().type === "weighing" || settingInference().type === "inferring") return
    if (!tally.ok || preview()?.ok !== true || typedOnly() || machineTypedOnly()) {
      nudge.nudge()
      return
    }
    setSubmission({ type: "saving" })
    const recorded = await given.submit(tally.value, ((terms) => (terms === undefined ? undefined : { game: tally.value.gameKind, terms }))(termsTypedOf(form())))
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
    inferable,
    settingInference,
    counterBonuses,
    atMachine,
    missesWouldSharpen,
    counterSet,
    resultText,
    resultTone,
    previewText,
    previewProblem,
    failure,
    saving: () => submission().type === "saving",
    submit,
  }
}
