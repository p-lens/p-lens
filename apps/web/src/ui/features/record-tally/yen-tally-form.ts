import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { ZERO, parseDecimal, subtract, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import type { InferenceTerms, KeptInferenceTerms } from "../../../core/book/settings"
import { identityKey, type Parlor } from "../../../core/parlor/parlor"
import * as Pachinko from "../../../core/pachinko"
import * as Pachislot from "../../../core/pachislot"
import type { InferredWorth, Settlement, TallyTold, YenTally } from "../../../core/tally/tally"
import type { PlayGameKind, PlayId } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import { readOptionalYen, type FieldProblem } from "./form"

/** A tally typed in by its totals in yen — what went in and what came back: every field text, nothing yet read. */
export interface YenTallyForm {
  readonly date: string
  /** The chosen parlor's identity key; empty when no parlor is named. */
  readonly parlorKey: string
  readonly gameKind: PlayGameKind
  readonly machine: string
  readonly cabinetNumber: string
  readonly outlay: string
  readonly takings: string
  readonly theoreticalValue: string
  /** How long the play lasted, in hours to the hundredth, as the hours and minutes chosen come to; empty when it is not said. */
  readonly hours: string
  readonly jackpots: string
  /** What a pachinko play is weighed on, as typed: so many balls for ¥1,000, so many for ¥100. */
  readonly weighingTerms: WeighingTermsForm
  /** What a pachislot play's data counter showed at the finish: the day's games, and each bonus by the id the counter shows it as. Its setting level is read from them. */
  readonly counterGames: string
  readonly counterBonuses: Readonly<Record<string, string>>
  /** What a pachislot play's medals were rented and exchanged at, as typed: so many for ¥1,000, so many for ¥100. */
  readonly medalTerms: MedalTermsForm
  /** An AT machine's history as typed: the games since the last AT when sat down at, whether the settings had been changed before then, each AT won and the games since the last at the finish. Its setting level is read from them. */
  readonly atHistory: AtHistoryForm
  /** How a recorded tally's two sides were settled, carried as it was through setting it right: no field asks it. */
  readonly settlement: Settlement | undefined
}

/** An empty form, on a day, its terms of each game those the book keeps, else the usual ones. */
export const emptyYenTallyForm = (date: string, kept: KeptInferenceTerms): YenTallyForm => ({
  date,
  parlorKey: "",
  gameKind: "pachinko",
  machine: "",
  cabinetNumber: "",
  outlay: "",
  takings: "",
  theoreticalValue: "",
  hours: "",
  jackpots: "",
  weighingTerms: weighingTermsFormOf(kept.pachinko ?? Pachinko.TERMS_BY_DEFAULT),
  counterGames: "",
  counterBonuses: {},
  medalTerms: medalTermsFormOf(kept.slot ?? Pachislot.MEDAL_TERMS_BY_DEFAULT),
  atHistory: EMPTY_AT_HISTORY,
  settlement: undefined,
})

/** The whole hours a play may be said to have lasted — up to a day and a night, some parlors being open the clock round at the turn of the year — and the minutes beside them, five at a time. */
export const HOUR_CHOICES: readonly number[] = Array.from({ length: 25 }, (_, hours) => hours)

const MINUTE_STEP = 5

export const MINUTE_CHOICES: readonly number[] = Array.from({ length: 60 / MINUTE_STEP }, (_, step) => step * MINUTE_STEP)

/** The minutes the hours a form holds come to, to the five minutes they are chosen by; none where no hours are said. */
export const minutesToldIn = (form: Pick<YenTallyForm, "hours">): number | undefined => {
  const hours = Number(form.hours)
  return form.hours === "" || !Number.isFinite(hours) ? undefined : Math.round((hours * 60) / MINUTE_STEP) * MINUTE_STEP
}

/** So many minutes as the hours a form holds, to the hundredth of an hour; no time at all is hours not said. */
export const hoursOfMinutes = (minutes: number): string => (minutes <= 0 ? "" : String(Math.round((minutes / 60) * 100) / 100))

type Read<T> = Result<T, FieldProblem>

/** An outlay must be given: a tally that cost nothing is typed as 0, not left out. */
const readOutlay = (text: string): Read<Decimal> => {
  if (tidyTyped(text) === "") return Err({ field: "outlay", reason: "required" })
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field: "outlay", reason: "not-a-number" })
}

/** Takings left empty are none: nothing came back. */
const readTakings = (text: string): Read<Decimal> => {
  if (tidyTyped(text) === "") return Ok(ZERO)
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field: "takings", reason: "not-a-number" })
}

/**
 * What the two sides typed come to, the takings less the outlay: the
 * result a person reads beside them and never types. None while either
 * does not read, or while no outlay is said.
 */
export const resultOfYenTally = (form: Pick<YenTallyForm, "outlay" | "takings">): Decimal | undefined => {
  const outlay = readOutlay(form.outlay)
  const takings = readTakings(form.takings)
  return outlay.ok && takings.ok ? subtract(takings.value, outlay.value) : undefined
}

/** No parlor named is a choice; a parlor named that the book does not keep is not. */
const readParlor = (key: string, parlors: readonly Parlor[]): Read<Parlor | undefined> => {
  if (key === "") return Ok(undefined)
  const parlor = parlors.find((candidate) => identityKey(candidate.identity) === key)
  return parlor === undefined ? Err({ field: "parlor", reason: "required" }) : Ok(parlor)
}

const WHOLE = /^\d+$/

/** A count left empty was not looked at, which is not the same as none. */
const readOptionalCount = (text: string, field: "jackpots"): Read<number | undefined> => {
  const plain = tidyTyped(text).replaceAll(",", "")
  if (plain === "") return Ok(undefined)
  return WHOLE.test(plain) ? Ok(Number(plain)) : Err({ field, reason: "not-a-number" })
}

/** What was told of the play beside its two sides: nothing unless its hours are said, its jackpots being told of a play whose hours are known. */
const readTold = (form: YenTallyForm): Read<TallyTold | undefined> => {
  const hours = parseDecimal(form.hours)
  const jackpots = readOptionalCount(form.jackpots, "jackpots")
  if (!jackpots.ok) return jackpots
  return Ok(form.hours === "" || !hours.ok ? undefined : { hours: hours.value, jackpots: jackpots.value, inferred: undefined })
}

const problemOf = (read: Read<unknown>): readonly FieldProblem[] => (read.ok ? [] : [read.error])

/**
 * The form read into a tally in yen, or every field that could not be
 * read. Whether the tally can be written is the core's to say afterwards.
 * The tally's id is asked for once its date is read: a tally added by hand
 * is named for the day its play was played.
 */
export const readYenTallyForm = (form: YenTallyForm, parlors: readonly Parlor[], idOn: (date: IsoDate) => PlayId): Result<YenTally, readonly FieldProblem[]> => {
  const date = parseIsoDate(form.date)
  const dateRead: Read<IsoDate> = date.ok ? date : Err({ field: "date", reason: "not-a-date" })
  const parlor = readParlor(form.parlorKey, parlors)
  const outlay = readOutlay(form.outlay)
  const takings = readTakings(form.takings)
  const theoreticalValue = readOptionalYen(form.theoreticalValue, "theoretical-value")
  const told = readTold(form)
  if (!dateRead.ok || !parlor.ok || !outlay.ok || !takings.ok || !theoreticalValue.ok || !told.ok) return Err([dateRead, parlor, outlay, takings, theoreticalValue, told].flatMap(problemOf))
  return Ok({
    id: idOn(dateRead.value),
    date: dateRead.value,
    parlor: parlor.value,
    gameKind: form.gameKind,
    machine: form.machine,
    cabinetNumber: form.cabinetNumber.trim() === "" ? undefined : form.cabinetNumber,
    outlay: outlay.value,
    takings: takings.value,
    settlement: form.settlement,
    theoreticalValue: theoreticalValue.value,
    told: told.value,
  })
}

/** What was told of a play, as the figures it is weighed from; none for a play whose hours are not said. */
export const toldFiguresOf = (tally: YenTally): Pachinko.Told | undefined =>
  tally.told?.hours === undefined
    ? undefined
    : { hours: Number(toPlainString(tally.told.hours)), outlay: Number(toPlainString(tally.outlay)), takings: Number(toPlainString(tally.takings)), jackpots: tally.told.jackpots }

/** A pachinko play's terms as the form holds them. */
interface WeighingTermsForm {
  readonly rentedPerThousand: string
  readonly exchangedPerHundred: string
}

/** The terms as the form opens on them, the exchange as players say it: 28, 27.5. */
export const weighingTermsFormOf = (terms: Pachinko.WeighingTerms): WeighingTermsForm => ({ rentedPerThousand: String(terms.rentedPerThousand), exchangedPerHundred: String(terms.exchangedPerHundred) })

const TO_TWO_PLACES = /^\d+(\.\d{1,2})?$/

/** A pachinko play's terms as typed, where both read: a whole number of balls rented, and a number exchanged to two places at most, each more than none. */
export const readWeighingTerms = (form: WeighingTermsForm): Pachinko.WeighingTerms | undefined => {
  const rented = tidyTyped(form.rentedPerThousand).replaceAll(",", "")
  const exchanged = tidyTyped(form.exchangedPerHundred)
  return WHOLE_COUNT.test(rented) && Number(rented) > 0 && TO_TWO_PLACES.test(exchanged) && Number(exchanged) > 0 ? { rentedPerThousand: Number(rented), exchangedPerHundred: Number(exchanged) } : undefined
}

/** The terms a form says for the game it is of, where they read. */
export const termsTypedOf = (form: Pick<YenTallyForm, "gameKind" | "weighingTerms" | "medalTerms">): InferenceTerms | undefined =>
  form.gameKind === "pachinko" ? readWeighingTerms(form.weighingTerms) : readMedalTerms(form.medalTerms)

/** A pachislot play's medal terms as the form holds them. */
interface MedalTermsForm {
  readonly rentedPerThousand: string
  readonly exchangedPerHundred: string
}

/** The terms as the form opens on them, the exchange to the places it needs and no more: 5.1, 5.15. */
export const medalTermsFormOf = (terms: Pachislot.MedalTerms): MedalTermsForm => ({ rentedPerThousand: String(terms.rentedPerThousand), exchangedPerHundred: String(Math.round(terms.exchangedPerHundred * 100) / 100) })

const WHOLE_COUNT = /^\d+$/

/** A count as typed, whole: none where left empty, undefined where it does not read as one. */
const countTyped = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return plain === "" ? 0 : WHOLE_COUNT.test(plain) ? Number(plain) : undefined
}

/** A pachislot play's medal terms as typed, where both read: a whole number rented, any positive number exchanged. */
export const readMedalTerms = (form: MedalTermsForm): Pachislot.MedalTerms | undefined => {
  const rented = tidyTyped(form.rentedPerThousand).replaceAll(",", "")
  const exchanged = Number(tidyTyped(form.exchangedPerHundred))
  return WHOLE_COUNT.test(rented) && Number(rented) > 0 && Number.isFinite(exchanged) && exchanged > 0 ? { rentedPerThousand: Number(rented), exchangedPerHundred: exchanged } : undefined
}

/**
 * What a pachislot tally tells to read its setting level from, where it
 * tells enough: the counter's day games, more than none, and every bonus
 * that reads — one left empty is none — with the play's hours and the cash
 * it put in. None while the games, the hours or any bonus does not read.
 */
export const pachislotToldOf = (form: YenTallyForm, bonusIds: readonly string[]): Pachislot.Told | undefined => {
  const games = countTyped(form.counterGames)
  const hours = Number(form.hours)
  const outlay = Number(tidyTyped(form.outlay).replaceAll(",", "") || "0")
  const bonuses = bonusIds.map((id) => [id, countTyped(form.counterBonuses[id] ?? "")] as const)
  if (games === undefined || games === 0 || form.hours === "" || !Number.isFinite(hours) || !Number.isFinite(outlay) || bonuses.some(([, count]) => count === undefined)) return undefined
  return { games, bonuses: Object.fromEntries(bonuses.map(([id, count]) => [id, count ?? 0])), hours, outlay }
}

/** An AT machine's history as typed. */
export interface AtHistoryForm {
  readonly sinceAt: string
  readonly afterReset: boolean
  /** Each AT won, in order: its games, and the triggers missed in them where counted. */
  readonly ats: readonly AtWonForm[]
  readonly since: string
}

export interface AtWonForm {
  readonly games: string
  readonly misses: string
}

const EMPTY_AT_HISTORY: AtHistoryForm = { sinceAt: "", afterReset: false, ats: [], since: "" }

/** An AT row as it is added: nothing typed in it. */
export const NEW_AT_WON: AtWonForm = { games: "", misses: "" }

/** An AT row read: its games, more than none, and its misses where typed; none where either is typed and does not read. */
const atWonOf = (at: AtWonForm): Pachislot.AtWon | undefined => {
  const games = countTyped(at.games)
  const misses = at.misses.trim() === "" ? undefined : countTyped(at.misses)
  return games === undefined || games === 0 || (at.misses.trim() !== "" && misses === undefined) ? undefined : { games, misses }
}

/**
 * What an AT machine's tally tells to read its setting level from, where it
 * tells enough: every AT row's games, more than none — a row left wholly
 * empty is no AT — its misses where typed, the games since sitting down and
 * since the last AT, none where left empty, and at least one game in all;
 * with the cash put in. None while anything typed does not read.
 */
export const atToldOf = (form: YenTallyForm): Pachislot.AtTold | undefined => {
  const history = form.atHistory
  const ats = history.ats.filter((at) => at.games.trim() !== "" || at.misses.trim() !== "").map(atWonOf)
  const sinceAt = countTyped(history.sinceAt)
  const since = countTyped(history.since)
  const outlay = Number(tidyTyped(form.outlay).replaceAll(",", "") || "0")
  const read = ats.filter((at) => at !== undefined)
  if (sinceAt === undefined || since === undefined || !Number.isFinite(outlay) || read.length < ats.length) return undefined
  return read.length === 0 && since === 0 ? undefined : { sinceAt, afterReset: history.afterReset, ats: read, since, outlay }
}

/** A tally with what its play was taken to be worth; one whose hours were not said is told of by that alone. */
export const withInferred = (tally: YenTally, inferred: InferredWorth | undefined): YenTally =>
  inferred === undefined && tally.told === undefined ? tally : { ...tally, told: { ...(tally.told ?? { hours: undefined, jackpots: undefined }), inferred } }

/** The yen tally form filled in from a recorded tally in yen, for setting it right: its words and its figures as its entry has them, and the terms it was weighed on — else those the book keeps, else the usual ones. */
export const yenTallyFormOf = (tally: YenTally, kept: KeptInferenceTerms): YenTallyForm => ({
  date: tally.date,
  parlorKey: tally.parlor === undefined ? "" : identityKey(tally.parlor.identity),
  gameKind: tally.gameKind,
  machine: tally.machine,
  cabinetNumber: tally.cabinetNumber ?? "",
  outlay: toPlainString(tally.outlay),
  takings: toPlainString(tally.takings),
  theoreticalValue: tally.theoreticalValue === undefined ? "" : toPlainString(tally.theoreticalValue),
  hours: tally.told?.hours === undefined ? "" : toPlainString(tally.told.hours),
  jackpots: tally.told?.jackpots === undefined ? "" : String(tally.told.jackpots),
  settlement: tally.settlement,
  weighingTerms: weighingTermsFormOf(((inferred) => (inferred === undefined || tally.gameKind !== "pachinko" ? undefined : Pachinko.weighingTermsOf(inferred)))(tally.told?.inferred) ?? kept.pachinko ?? Pachinko.TERMS_BY_DEFAULT),
  counterGames: "",
  counterBonuses: {},
  atHistory: EMPTY_AT_HISTORY,
  medalTerms: medalTermsFormOf(((inferred) => (inferred === undefined || tally.gameKind !== "slot" ? undefined : Pachislot.medalTermsOf(inferred)))(tally.told?.inferred) ?? kept.slot ?? Pachislot.MEDAL_TERMS_BY_DEFAULT),
})
