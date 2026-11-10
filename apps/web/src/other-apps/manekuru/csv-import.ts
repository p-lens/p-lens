import { ZERO, compare, decimal, subtract, type Decimal } from "../../core/decimal/decimal"
import { Err, Ok, type Result } from "../../core/result/result"
import { clockFrom } from "../../core/tally/clock"
import type { ClockTime, PlayClock } from "../../core/tally/tally"
import { dayOf, signedYenOf, unreadableOf, yenOf, type RowField, type RowsUnreadable } from "../core/cells"
import { rowsOfCsv, type CsvProblem } from "../core/csv-rows"
import type { SourceTally } from "../core/source-tally"
import { gameKindOfStake } from "./stake"

/** マネクルSP, as an imported tally says where it came from. */
export const MANEKURU = "manekuru"

/**
 * The columns マネクルSP's CSV names in its first row, each by every name
 * it has gone by: its import guide's, a start and a finish each as an
 * hour and a minute, and its sample file's, a start as one cell and no
 * finish. Names are compared with their brackets made half-width and
 * their spaces taken out, the two writing them either way.
 */
const COLUMNS = {
  date: ["日付"],
  startHour: ["開始(時)"],
  startMinute: ["開始(分)"],
  start: ["開始時間"],
  finishHour: ["終了(時)"],
  finishMinute: ["終了(分)"],
  finish: ["終了時間"],
  minutes: ["稼働時間(分間)", "稼働時間(分)"],
  outlay: ["投資金額"],
  takings: ["回収金額"],
  theoreticalValue: ["期待値"],
  stake: ["投資種類"],
  parlor: ["店舗"],
  machine: ["機種"],
  labels: ["タグ"],
  memo: ["メモ"],
} as const

type Column = keyof typeof COLUMNS

/** The columns a file is known as マネクルSP's by: its rows may leave every cell but the day empty. */
const REQUIRED: readonly Column[] = ["date", "outlay", "takings"]

/**
 * Why a file is not taken in.
 *
 * - `not-manekuru`: its first row does not name the columns a tally needs.
 * - `rows-unreadable`: these rows do not read.
 */
export type ManekuruProblem = { readonly type: "empty" } | { readonly type: "not-manekuru"; readonly missing: readonly string[] } | RowsUnreadable | CsvProblem

/** A column's name as it is compared: its brackets half-width and its spaces gone. */
const plainName = (name: string): string => name.replaceAll("（", "(").replaceAll("）", ")").replace(/[\s　]+/g, "")

/** A sum of yen マネクルSP lets a person leave empty, which it takes as none spent or none come back. */
const yenOrNothing = (text: string): Decimal | undefined => (text.trim() === "" ? ZERO : yenOf(text))

const WHOLE = /^\d+$/

const HOUR_AND_MINUTE = /^(\d{1,2})(?::(\d{2}))?$/

const timeOf = (hour: number, minute: number): ClockTime | undefined => (hour < 24 && minute < 60 ? { hour, minute } : undefined)

/** A time as an hour cell and a minute cell, a minute left empty being on the hour: none where the hour is empty, and a cell that says something else does not read. */
const splitTimeOf = (hour: string, minute: string): Result<ClockTime | undefined, "unread"> => {
  if (hour.trim() === "" && minute.trim() === "") return Ok(undefined)
  if (!WHOLE.test(hour.trim()) || !(minute.trim() === "" || WHOLE.test(minute.trim()))) return Err("unread")
  const time = timeOf(Number(hour.trim()), Number(minute.trim() === "" ? "0" : minute.trim()))
  return time === undefined ? Err("unread") : Ok(time)
}

/** A time as one cell, an hour alone, `18`, or an hour and its minute, `18:30`: none where the cell is empty, and a cell that says something else does not read. */
const wholeTimeOf = (text: string): Result<ClockTime | undefined, "unread"> => {
  if (text.trim() === "") return Ok(undefined)
  const read = HOUR_AND_MINUTE.exec(text.trim())
  const time = read === null ? undefined : timeOf(Number(read[1]), Number(read[2] ?? "0"))
  return time === undefined ? Err("unread") : Ok(time)
}

/** A time from whichever of the two ways a file gives it: as two cells where it has them, and as one where it has that. */
const eitherTimeOf = (hour: string, minute: string, whole: string): Result<ClockTime | undefined, "unread"> =>
  hour.trim() === "" && minute.trim() === "" ? wholeTimeOf(whole) : splitTimeOf(hour, minute)

const MINUTES_IN_A_DAY = 24 * 60

const minuteOfDay = (time: ClockTime): number => time.hour * 60 + time.minute

/** Minutes as hours to the hundredth; none where they come to none. */
const hoursOfMinutes = (minutes: number): Decimal | undefined => ((hundredths) => (hundredths > 0 ? decimal(BigInt(hundredths), 2) : undefined))(Math.round((minutes * 100) / 60))

/**
 * How long a play lasted, in hours to the hundredth: the minutes マネクルSP
 * kept under 稼働時間, or where it kept none, the time from its start to
 * its finish, past midnight where it finished before it began. None where
 * neither says, and a cell of minutes that says something else does not read.
 */
const hoursOf = (minutes: string, clock: PlayClock | undefined): Result<Decimal | undefined, "unread"> => {
  const plain = minutes.trim().replaceAll(",", "")
  if (plain !== "") return WHOLE.test(plain) ? Ok(hoursOfMinutes(Number(plain))) : Err("unread")
  if (clock?.started === undefined || clock.finished === undefined) return Ok(undefined)
  return Ok(hoursOfMinutes((minuteOfDay(clock.finished) - minuteOfDay(clock.started) + MINUTES_IN_A_DAY) % MINUTES_IN_A_DAY))
}

/**
 * The theoretical value a row gives: none where it is empty, and none
 * where it is the result itself — the みなし期待値 マネクルSP keeps where a
 * person gave none, which its own file cannot tell from one given.
 */
const theoreticalValueOf = (text: string, outlay: Decimal, takings: Decimal): Result<Decimal | undefined, "unread"> => {
  if (text.trim() === "") return Ok(undefined)
  const value = signedYenOf(text)
  if (value === undefined) return Err("unread")
  return compare(value, subtract(takings, outlay)) === 0 ? Ok(undefined) : Ok(value)
}

const LABEL_BREAK = /[/／]/

/** A tally's labels: its 投資種類 first, then its タグ as マネクルSP writes them, `タグ1/タグ2`, each once. */
const labelsOf = (stake: string, labels: string): readonly string[] => [...new Set([stake, ...labels.split(LABEL_BREAK)].map((label) => label.trim()))].filter((label) => label !== "")

/** A memo with マネクルSP's breaks, `<br/>`, as the lines they are. */
const memoOf = (text: string): string => text.replace(/<br\s*\/?>/gi, "\n").trim()

const fieldIf = (failed: boolean, field: RowField): readonly RowField[] => (failed ? [field] : [])

const tallyOf = (cell: (column: Column) => string): Result<SourceTally, readonly RowField[]> => {
  const [date, outlay, takings] = [dayOf(cell("date")), yenOrNothing(cell("outlay")), yenOrNothing(cell("takings"))]
  const [started, finished] = [eitherTimeOf(cell("startHour"), cell("startMinute"), cell("start")), eitherTimeOf(cell("finishHour"), cell("finishMinute"), cell("finish"))]
  const clock = started.ok && finished.ok ? clockFrom(started.value, finished.value) : undefined
  const hours = hoursOf(cell("minutes"), clock)
  const worth = outlay === undefined || takings === undefined ? Ok(undefined) : theoreticalValueOf(cell("theoreticalValue"), outlay, takings)
  if (date === undefined || outlay === undefined || takings === undefined || !started.ok || !finished.ok || !hours.ok || !worth.ok)
    return Err([
      ...fieldIf(date === undefined, "date"),
      ...fieldIf(outlay === undefined, "outlay"),
      ...fieldIf(takings === undefined, "takings"),
      ...fieldIf(!started.ok || !finished.ok, "clock"),
      ...fieldIf(!hours.ok, "hours"),
      ...fieldIf(!worth.ok, "theoreticalValue"),
    ])
  return Ok({
    date,
    parlor: { name: cell("parlor").trim(), code: "" },
    machine: { name: cell("machine").trim(), code: "", maker: "" },
    cabinetNumber: "",
    outlay,
    takings,
    memo: memoOf(cell("memo")),
    hours: hours.value,
    clock,
    theoreticalValue: worth.value,
    gameKind: gameKindOfStake(cell("stake")),
    countedSpins: undefined,
    countedJackpots: undefined,
    sourceLabels: labelsOf(cell("stake"), cell("labels")),
  })
}

/** Where each column stands in a file's first row, by any of its names; none where the file lacks it. */
const placesOf = (header: readonly string[]): ((column: Column) => number) => {
  const names = header.map(plainName)
  return (column) => names.findIndex((name) => COLUMNS[column].some((each) => plainName(each) === name))
}

/**
 * The tallies a マネクルSP CSV holds, in the file's order, or why it is
 * not taken in. Columns are found by the names in the first row, not by
 * where they stand, and a column the file lacks reads as empty unless a
 * file cannot be known as マネクルSP's without it. A row whose 投資金額 or
 * 回収金額 is empty spent or got back nothing, as マネクルSP takes it.
 */
export const readManekuru = (text: string): Result<readonly SourceTally[], ManekuruProblem> => {
  const csv = rowsOfCsv(text)
  if (!csv.ok) return csv
  const [header, ...rows] = csv.value
  if (header === undefined) return Err({ type: "empty" })
  const placeOf = placesOf(header)
  const missing = REQUIRED.filter((column) => placeOf(column) < 0).map((column) => COLUMNS[column][0])
  if (missing.length > 0) return Err({ type: "not-manekuru", missing })
  if (rows.length === 0) return Err({ type: "empty" })
  const read = rows.map((row) => tallyOf((column) => row[placeOf(column)] ?? ""))
  const unreadable = unreadableOf(read)
  return unreadable === undefined ? Ok(read.flatMap((tally) => (tally.ok ? [tally.value] : []))) : Err(unreadable)
}
