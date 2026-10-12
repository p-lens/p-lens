import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { decimal, parseDecimal, type Decimal } from "../decimal/decimal"
import { Err, Ok, type Result } from "../result/result"
import { rowsOfCsv } from "./csv-rows"
import type { SourcePlay } from "./source-play"

/** pRecord, as an imported play says where it came from. */
export const PRECORD = "precord"

/**
 * The columns pRecord's CSV names in its first row, as its own import
 * reads them. 収支, 時給 and 貯玉 are there too and are not read: the
 * first two follow from what is, and savings are no part of a play kept
 * in yen.
 */
const COLUMNS = {
  date: "日付",
  parlorCode: "店舗コード",
  parlor: "店舗",
  maker: "メーカー",
  machineCode: "機種コード",
  machine: "機種",
  cabinetNumber: "台番号",
  outlay: "投資額",
  takings: "回収額",
  memo: "メモ",
  hours: "稼働時間",
} as const

type Column = keyof typeof COLUMNS

/** The columns a row cannot do without, as pRecord's own import has them. */
const REQUIRED: readonly Column[] = ["date", "outlay", "takings"]

/** What of a row could not be read. */
export type RowField = "date" | "outlay" | "takings"

/**
 * Why a file is not taken in.
 *
 * - `not-precord`: its first row does not name the columns a play needs.
 * - `rows-unreadable`: these rows, by their line in the file, each with what of it does not read. Nothing of a file is taken in while any row of it does not.
 */
export type PrecordProblem =
  | { readonly type: "empty" }
  | { readonly type: "not-precord"; readonly missing: readonly string[] }
  | { readonly type: "rows-unreadable"; readonly rows: readonly { readonly line: number; readonly fields: readonly RowField[] }[] }

const DAY = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/

/** A day as pRecord writes it, `2019/01/02`; one written without its zeros, or with hyphens, is the same day. */
const dayOf = (text: string): IsoDate | undefined => {
  const read = DAY.exec(text.trim())
  const parsed = read === null ? undefined : parseIsoDate(`${read[1] ?? ""}-${(read[2] ?? "").padStart(2, "0")}-${(read[3] ?? "").padStart(2, "0")}`)
  return parsed?.ok === true ? parsed.value : undefined
}

const YEN_SUM = /^\d+$/

/** A sum of yen as typed into a cell: whole, not below nothing, commas allowed. */
const yenOf = (text: string): Decimal | undefined => {
  const plain = text.trim().replaceAll(",", "")
  const parsed = YEN_SUM.test(plain) ? parseDecimal(plain) : undefined
  return parsed?.ok === true ? parsed.value : undefined
}

const CLOCK = /^(\d{1,2}):(\d{2})(?::\d{2})?$/

/**
 * How long a play lasted, in hours to the hundredth, as pRecord writes it:
 * a number of hours — `2.4166667` is two hours and twenty-five minutes,
 * its own 時給 the result over it — or, should a file have it so, a
 * clock's `2:25`. None where the cell is empty, does not read, or comes to
 * no time at all: a play is taken in without its hours rather than
 * refused for them.
 */
const hoursOf = (text: string): Decimal | undefined => {
  const clock = CLOCK.exec(text.trim())
  const hours = clock === null ? Number(text.trim() === "" ? Number.NaN : text.trim()) : Number(clock[1]) + Number(clock[2]) / 60
  const hundredths = Number.isFinite(hours) ? Math.round(hours * 100) : 0
  return hundredths > 0 ? decimal(BigInt(hundredths), 2) : undefined
}

const playOf = (cell: (column: Column) => string): Result<SourcePlay, readonly RowField[]> => {
  const [date, outlay, takings] = [dayOf(cell("date")), yenOf(cell("outlay")), yenOf(cell("takings"))]
  if (date === undefined || outlay === undefined || takings === undefined)
    return Err([...(date === undefined ? (["date"] as const) : []), ...(outlay === undefined ? (["outlay"] as const) : []), ...(takings === undefined ? (["takings"] as const) : [])])
  return Ok({
    date,
    parlor: { name: cell("parlor").trim(), code: cell("parlorCode").trim() },
    machine: { name: cell("machine").trim(), code: cell("machineCode").trim(), maker: cell("maker").trim() },
    cabinetNumber: cell("cabinetNumber").trim(),
    outlay,
    takings,
    memo: cell("memo").trim(),
    hours: hoursOf(cell("hours")),
  })
}

/**
 * The plays a pRecord CSV holds, in the file's order, or why it is not
 * taken in. Columns are found by the names in the first row, not by where
 * they stand, and a column the file lacks reads as empty unless a play
 * cannot do without it.
 */
export const readPrecord = (text: string): Result<readonly SourcePlay[], PrecordProblem> => {
  const [header, ...rows] = rowsOfCsv(text)
  if (header === undefined) return Err({ type: "empty" })
  const names = header.map((name) => name.trim())
  const missing = REQUIRED.filter((column) => !names.includes(COLUMNS[column])).map((column) => COLUMNS[column])
  if (missing.length > 0) return Err({ type: "not-precord", missing })
  if (rows.length === 0) return Err({ type: "empty" })
  const read = rows.map((row) => playOf((column) => row[names.indexOf(COLUMNS[column])] ?? ""))
  const unreadable = read.flatMap((play, index) => (play.ok ? [] : [{ line: index + 2, fields: play.error }]))
  return unreadable.length > 0 ? Err({ type: "rows-unreadable", rows: unreadable }) : Ok(read.flatMap((play) => (play.ok ? [play.value] : [])))
}
