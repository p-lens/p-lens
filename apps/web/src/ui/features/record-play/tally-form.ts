import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { ZERO, parseDecimal, subtract, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import { tokenValueOfDraft, type PlayDraft } from "../../../core/live-play/draft"
import { identityKey, type Parlor } from "../../../core/parlor/parlor"
import type { PlayGameKind, PlayId, TalliedPlay } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import { readOptionalYen, type FieldProblem, type PlayedSoFar } from "./form"

/** A play typed in by its totals in yen — what went in and what came back: every field text, nothing yet read. */
export interface TallyForm {
  readonly date: string
  /** The chosen parlor's identity key; empty when no parlor is named. */
  readonly parlorKey: string
  readonly gameKind: PlayGameKind
  readonly machine: string
  readonly cabinetNumber: string
  readonly outlay: string
  readonly takings: string
  readonly theoreticalValue: string
}

export const emptyTallyForm = (date: string): TallyForm => ({
  date,
  parlorKey: "",
  gameKind: "pachinko",
  machine: "",
  cabinetNumber: "",
  outlay: "",
  takings: "",
  theoreticalValue: "",
})

type Read<T> = Result<T, FieldProblem>

/** An outlay must be given: a play that cost nothing is typed as 0, not left out. */
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
export const resultOfTally = (form: Pick<TallyForm, "outlay" | "takings">): Decimal | undefined => {
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

const problemOf = (read: Read<unknown>): readonly FieldProblem[] => (read.ok ? [] : [read.error])

/**
 * The form read into a play kept in yen, or every field that could not be
 * read. Whether the play can be written is the core's to say afterwards.
 * The play's id is asked for once its date is read: a play added by hand is
 * named for the day it was played.
 */
export const readTallyForm = (form: TallyForm, parlors: readonly Parlor[], idOn: (date: IsoDate) => PlayId): Result<TalliedPlay, readonly FieldProblem[]> => {
  const date = parseIsoDate(form.date)
  const dateRead: Read<IsoDate> = date.ok ? date : Err({ field: "date", reason: "not-a-date" })
  const parlor = readParlor(form.parlorKey, parlors)
  const outlay = readOutlay(form.outlay)
  const takings = readTakings(form.takings)
  const theoreticalValue = readOptionalYen(form.theoreticalValue, "theoretical-value")
  if (!dateRead.ok || !parlor.ok || !outlay.ok || !takings.ok || !theoreticalValue.ok) return Err([dateRead, parlor, outlay, takings, theoreticalValue].flatMap(problemOf))
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
  })
}

const yenText = (yen: number | undefined): string => (yen === undefined ? "" : String(Math.round(yen)))

/**
 * The tokens a play followed live at no parlor is counted by as it is
 * recorded: those it was begun with in hand and those in hand as it
 * ended, as typed, with what a token exchanges for and the cash spent. The
 * book keeps such a play in yen alone; the counts are what its two sides
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

/** The tokens in hand as the play ended, as typed: none where left empty or unread. */
export const heldIn = (counts: TokenCounts): number => readTokens(counts.held) ?? 0

type Sides = Pick<TallyForm, "outlay" | "takings">

const sidesOf = (carriedIn: number, held: number, tokenValue: number, outlay: number): Sides => ({ outlay: yenText(carriedIn * tokenValue + outlay), takings: yenText(held * tokenValue) })

/**
 * The two sides the counts come to, as the form holds them: the tokens the
 * play was begun with are put in beside the cash spent, at the exchange,
 * and the tokens in hand at the end are what came back. So the plays of a
 * day at no parlor hand their tokens on, each one's takings the next one's
 * outlay. None while either count does not read, or while nothing is said
 * of the end: a side is not made up from a field left empty.
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
 * The tally form filled in from a play followed live with no parlor: its
 * words, its two sides where its log counted what was in hand at the end,
 * the cash it spent alone where it did not, and its theoretical value
 * where there is one.
 */
export const tallyFormFromDraft = (draft: PlayDraft, played: PlayedSoFar): TallyForm => {
  const tokenValue = tokenValueOfDraft(draft)
  return {
    ...emptyTallyForm(draft.date),
    gameKind: draft.gameKind,
    machine: draft.machine,
    cabinetNumber: draft.cabinetNumber ?? "",
    ...(tokenValue === undefined || played.held === undefined ? { outlay: yenText(played.outlay) } : sidesOf(played.carriedIn ?? 0, played.held, tokenValue, played.outlay ?? 0)),
    theoreticalValue: yenText(played.theoreticalValue),
  }
}

/** The tally form filled in from a recorded play kept in yen, for setting it right: its words and its figures as its entry has them. */
export const tallyFormOfPlay = (play: TalliedPlay): TallyForm => ({
  date: play.date,
  parlorKey: play.parlor === undefined ? "" : identityKey(play.parlor.identity),
  gameKind: play.gameKind,
  machine: play.machine,
  cabinetNumber: play.cabinetNumber ?? "",
  outlay: toPlainString(play.outlay),
  takings: toPlainString(play.takings),
  theoreticalValue: play.theoreticalValue === undefined ? "" : toPlainString(play.theoreticalValue),
})
