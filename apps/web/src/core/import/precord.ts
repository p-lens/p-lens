import { Err, Ok, type Result } from "../result/result"
import { dayOf, hoursOf, unreadableOf, yenOf, type RowField, type RowsUnreadable } from "./cells"
import { rowsOfCsv, type CsvProblem } from "./csv-rows"
import type { SourceTally } from "./source-tally"

/** pRecord, as an imported tally says where it came from. */
export const PRECORD = "precord"

/**
 * The columns pRecord's CSV names in its first row, as its own import
 * reads them. 収支, 時給 and 貯玉 are there too and are not read: the
 * first two follow from what is, and savings are no part of a tally kept
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

/**
 * Why a file is not taken in.
 *
 * - `not-precord`: its first row does not name the columns a tally needs.
 * - `rows-unreadable`: these rows do not read.
 */
export type PrecordProblem =
  | { readonly type: "empty" }
  | { readonly type: "not-precord"; readonly missing: readonly string[] }
  | RowsUnreadable
  | CsvProblem

const tallyOf = (cell: (column: Column) => string): Result<SourceTally, readonly RowField[]> => {
  const [date, outlay, takings, hours] = [dayOf(cell("date")), yenOf(cell("outlay")), yenOf(cell("takings")), hoursOf(cell("hours"))]
  if (date === undefined || outlay === undefined || takings === undefined || !hours.ok)
    return Err([
      ...(date === undefined ? (["date"] as const) : []),
      ...(outlay === undefined ? (["outlay"] as const) : []),
      ...(takings === undefined ? (["takings"] as const) : []),
      ...(hours.ok ? [] : (["hours"] as const)),
    ])
  return Ok({
    date,
    parlor: { name: cell("parlor").trim(), code: cell("parlorCode").trim() },
    machine: { name: cell("machine").trim(), code: cell("machineCode").trim(), maker: cell("maker").trim() },
    cabinetNumber: cell("cabinetNumber").trim(),
    outlay,
    takings,
    memo: cell("memo").trim(),
    hours: hours.value,
    gameKind: undefined,
    countedSpins: undefined,
    countedJackpots: undefined,
    sourceLabels: [],
  })
}

/**
 * The tallies a pRecord CSV holds, in the file's order, or why it is not
 * taken in. Columns are found by the names in the first row, not by where
 * they stand, and a column the file lacks reads as empty unless a tally
 * cannot do without it.
 */
export const readPrecord = (text: string): Result<readonly SourceTally[], PrecordProblem> => {
  const csv = rowsOfCsv(text)
  if (!csv.ok) return csv
  const [header, ...rows] = csv.value
  if (header === undefined) return Err({ type: "empty" })
  const names = header.map((name) => name.trim())
  const missing = REQUIRED.filter((column) => !names.includes(COLUMNS[column])).map((column) => COLUMNS[column])
  if (missing.length > 0) return Err({ type: "not-precord", missing })
  if (rows.length === 0) return Err({ type: "empty" })
  const read = rows.map((row) => tallyOf((column) => row[names.indexOf(COLUMNS[column])] ?? ""))
  const unreadable = unreadableOf(read)
  return unreadable === undefined ? Ok(read.flatMap((tally) => (tally.ok ? [tally.value] : []))) : Err(unreadable)
}
