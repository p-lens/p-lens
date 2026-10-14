import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { ZERO, parseDecimal, subtract, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import { tokenValueOfDraft, type PlayDraft } from "../../../core/live-play/draft"
import { identityKey, type Parlor } from "../../../core/parlor/parlor"
import * as Pachinko from "../../../core/pachinko"
import type { InferredWorth, TallyTold, YenTally } from "../../../core/tally/tally"
import type { PlayGameKind, PlayId } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import { theoreticalDecimalOf } from "../../../core/theoretical/theoretical"
import { readOptionalYen, type FieldProblem, type PlayedSoFar } from "./form"

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
  /** What the play is weighed on, where it is: what a ball rented for and how balls were exchanged. */
  readonly weighingTerms: Pachinko.WeighingTerms
}

export const emptyYenTallyForm = (date: string): YenTallyForm => ({
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
  weighingTerms: Pachinko.TERMS_BY_DEFAULT,
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
    theoreticalValue: theoreticalValue.value,
    told: told.value,
  })
}

/** What was told of a play, as the figures it is weighed from; none for a play whose hours are not said. */
export const toldFiguresOf = (tally: YenTally): Pachinko.Told | undefined =>
  tally.told === undefined
    ? undefined
    : { hours: Number(toPlainString(tally.told.hours)), outlay: Number(toPlainString(tally.outlay)), takings: Number(toPlainString(tally.takings)), jackpots: tally.told.jackpots }

/** A tally with what its play was taken to be worth; a tally nothing was told of is as it was. */
export const withInferred = (tally: YenTally, inferred: InferredWorth | undefined): YenTally => (tally.told === undefined ? tally : { ...tally, told: { ...tally.told, inferred } })

const yenText = (yen: number | undefined): string => (yen === undefined ? "" : String(Math.round(yen)))

/**
 * The tokens a play followed live at no parlor is counted by as it is
 * recorded: those it was begun with in hand and those in hand as it
 * finished, as typed, with what a token exchanges for and the cash spent. The
 * book keeps the tally of such a play in yen alone; the counts are what its two sides
 * are worked out from, and what it leaves for the day's next play.
 */
export interface TokenCounts {
  readonly carriedIn: string
  readonly held: string
  readonly tokenValue: number
  readonly outlay: number
}

const COUNT = /^\d+$/

/** A count as typed: none where left empty, undefined where it does not read as one. */
const readTokens = (typed: string): number | undefined => {
  const plain = tidyTyped(typed).replaceAll(",", "")
  if (plain === "") return 0
  return COUNT.test(plain) ? Number(plain) : undefined
}

/** The tokens in hand as the play finished, as typed: none where left empty or unread. */
export const heldIn = (counts: TokenCounts): number => readTokens(counts.held) ?? 0

type Sides = Pick<YenTallyForm, "outlay" | "takings">

const sidesOf = (carriedIn: number, held: number, tokenValue: number, outlay: number): Sides => ({ outlay: yenText(carriedIn * tokenValue + outlay), takings: yenText(held * tokenValue) })

/**
 * The two sides the counts come to, as the form holds them: the tokens the
 * play was begun with are put in beside the cash spent, at the exchange,
 * and the tokens in hand at the finish are what came back. So the plays of a
 * day at no parlor hand their tokens on, each one's takings the next one's
 * outlay. None while either count does not read, or while nothing is said
 * of the finish: a side is not made up from a field left empty.
 */
export const sidesFromTokens = (counts: TokenCounts): Sides | undefined => {
  const carriedIn = readTokens(counts.carriedIn)
  const held = readTokens(counts.held)
  return carriedIn === undefined || held === undefined || tidyTyped(counts.held) === "" ? undefined : sidesOf(carriedIn, held, counts.tokenValue, counts.outlay)
}

/** The counts a play followed live opens its recording on: what its log says of each, with its terms' exchange and its outlay. None for a play with no terms, which counts no tokens. */
export const tokenCountsFromDraft = (draft: PlayDraft, played: PlayedSoFar): TokenCounts | undefined => {
  const tokenValue = tokenValueOfDraft(draft)
  const said = (count: number | undefined): string => (count === undefined || count === 0 ? "" : String(count))
  return tokenValue === undefined ? undefined : { carriedIn: said(played.carriedIn), held: said(played.held), tokenValue, outlay: played.outlay ?? 0 }
}

/**
 * The yen tally form filled in from a play followed live with no parlor: its
 * words, its two sides where its log counted what was in hand at the finish,
 * the cash it spent alone where it did not, and its theoretical value
 * where there is one.
 */
export const yenTallyFormFromDraft = (draft: PlayDraft, played: PlayedSoFar): YenTallyForm => {
  const tokenValue = tokenValueOfDraft(draft)
  return {
    ...emptyYenTallyForm(draft.date),
    gameKind: draft.gameKind,
    machine: draft.machine,
    cabinetNumber: draft.cabinetNumber ?? "",
    ...(tokenValue === undefined || played.held === undefined ? { outlay: yenText(played.outlay) } : sidesOf(played.carriedIn ?? 0, played.held, tokenValue, played.outlay ?? 0)),
    theoreticalValue: played.theoreticalValue === undefined ? "" : toPlainString(theoreticalDecimalOf(played.theoreticalValue)),
  }
}

/** The yen tally form filled in from a recorded tally in yen, for setting it right: its words and its figures as its entry has them. */
export const yenTallyFormOf = (tally: YenTally): YenTallyForm => ({
  date: tally.date,
  parlorKey: tally.parlor === undefined ? "" : identityKey(tally.parlor.identity),
  gameKind: tally.gameKind,
  machine: tally.machine,
  cabinetNumber: tally.cabinetNumber ?? "",
  outlay: toPlainString(tally.outlay),
  takings: toPlainString(tally.takings),
  theoreticalValue: tally.theoreticalValue === undefined ? "" : toPlainString(tally.theoreticalValue),
  hours: tally.told === undefined ? "" : toPlainString(tally.told.hours),
  jackpots: tally.told?.jackpots === undefined ? "" : String(tally.told.jackpots),
  weighingTerms: ((inferred) => (inferred === undefined ? undefined : Pachinko.termsOf(Number(toPlainString(inferred.tokenRental)), Number(toPlainString(inferred.tokenExchange)))))(tally.told?.inferred) ?? Pachinko.TERMS_BY_DEFAULT,
})
