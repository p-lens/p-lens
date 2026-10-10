import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { parseDecimal, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import { tokenValueOfDraft, type PlayDraft } from "../../../core/live-play/draft"
import { identityKey, type Parlor } from "../../../core/parlor/parlor"
import type { PlayGameKind, PlayId, TalliedPlay } from "../../../core/play/play"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import { readOptionalYen, type FieldProblem, type PlayedSoFar } from "./form"

/** A play typed in by its totals in yen: every field text, nothing yet read. */
export interface TallyForm {
  readonly date: string
  /** The chosen parlor's identity key; empty when no parlor is named. */
  readonly parlorKey: string
  readonly gameKind: PlayGameKind
  readonly machine: string
  readonly cabinetNumber: string
  readonly result: string
  readonly theoreticalValue: string
}

export const emptyTallyForm = (date: string): TallyForm => ({
  date,
  parlorKey: "",
  gameKind: "pachinko",
  machine: "",
  cabinetNumber: "",
  result: "",
  theoreticalValue: "",
})

type Read<T> = Result<T, FieldProblem>

/** A result must be given: an even day is typed as 0, not left out. */
const readResult = (text: string): Read<Decimal> => {
  if (tidyTyped(text) === "") return Err({ field: "result", reason: "required" })
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field: "result", reason: "not-a-number" })
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
  const result = readResult(form.result)
  const theoreticalValue = readOptionalYen(form.theoreticalValue, "theoretical-value")
  if (!dateRead.ok || !parlor.ok || !result.ok || !theoreticalValue.ok) return Err([dateRead, parlor, result, theoreticalValue].flatMap(problemOf))
  return Ok({
    id: idOn(dateRead.value),
    date: dateRead.value,
    parlor: parlor.value,
    gameKind: form.gameKind,
    machine: form.machine,
    cabinetNumber: form.cabinetNumber.trim() === "" ? undefined : form.cabinetNumber,
    result: result.value,
    theoreticalValue: theoreticalValue.value,
  })
}

/**
 * What a play followed live came to in yen by its log, where the log says
 * enough: the tokens counted in hand at its last line, at what its terms
 * exchange them for, less the cash spent. A play that drew from savings
 * has a parlor, and is not recorded by its result.
 */
const resultOf = (draft: PlayDraft, played: PlayedSoFar): number | undefined => {
  const value = tokenValueOfDraft(draft)
  return value === undefined || played.held === undefined ? undefined : Math.round(played.held * value - (played.outlay ?? 0))
}

const yenText = (yen: number | undefined): string => (yen === undefined ? "" : String(Math.round(yen)))

/** The tally form filled in from a play followed live with no parlor: its words, its result where its log counted what was in hand at the end, and its theoretical value where there is one. */
export const tallyFormFromDraft = (draft: PlayDraft, played: PlayedSoFar): TallyForm => ({
  ...emptyTallyForm(draft.date),
  gameKind: draft.gameKind,
  machine: draft.machine,
  cabinetNumber: draft.cabinetNumber ?? "",
  result: yenText(resultOf(draft, played)),
  theoreticalValue: yenText(played.theoreticalValue),
})

/** The tally form filled in from a recorded play kept in yen, for setting it right: its words and its figures as its entry has them. */
export const tallyFormOfPlay = (play: TalliedPlay): TallyForm => ({
  date: play.date,
  parlorKey: play.parlor === undefined ? "" : identityKey(play.parlor.identity),
  gameKind: play.gameKind,
  machine: play.machine,
  cabinetNumber: play.cabinetNumber ?? "",
  result: toPlainString(play.result),
  theoreticalValue: play.theoreticalValue === undefined ? "" : toPlainString(play.theoreticalValue),
})
