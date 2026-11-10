import { Err, Ok, andThen, type Result } from "../../core/result/result"
import { dayOf, labelsOf, unreadableOf, yenOf, type RowField } from "../core/cells"
import { rowsOfCsv } from "../core/csv-rows"
import { playsOf, taggedOf, type MaxbetProblem, type MaxbetTallies, type Tagged } from "./tags"

/**
 * The columns MAXBET's CSV names in its first row. It keeps a tally in yen
 * and no more: no parlor, machine, cabinet, hours or counts, and its 収支
 * only what 回収 less 投資 comes to, which is not read.
 */
const COLUMNS = {
  date: "日付",
  outlay: "投資",
  takings: "回収",
  labels: "タグ",
  memo: "メモ",
} as const

type Column = keyof typeof COLUMNS

/** The columns a row cannot do without. */
const REQUIRED: readonly Column[] = ["date", "outlay", "takings"]

const rowOf = (cell: (column: Column) => string): Result<Tagged, readonly RowField[]> => {
  const [date, outlay, takings] = [dayOf(cell("date")), yenOf(cell("outlay")), yenOf(cell("takings"))]
  if (date === undefined || outlay === undefined || takings === undefined)
    return Err([...(date === undefined ? (["date"] as const) : []), ...(outlay === undefined ? (["outlay"] as const) : []), ...(takings === undefined ? (["takings"] as const) : [])])
  return Ok(taggedOf(date, outlay, takings, labelsOf(cell("labels")), cell("memo")))
}

const readRows = (text: string): Result<readonly Tagged[], MaxbetProblem> => {
  const csv = rowsOfCsv(text)
  if (!csv.ok) return csv
  const [header, ...rows] = csv.value
  if (header === undefined) return Err({ type: "empty" })
  const names = header.map((name) => name.trim())
  if (REQUIRED.some((column) => !names.includes(COLUMNS[column]))) return Err({ type: "not-maxbet" })
  if (rows.length === 0) return Err({ type: "empty" })
  const read = rows.map((row) => rowOf((column) => row[names.indexOf(COLUMNS[column])] ?? ""))
  const unreadable = unreadableOf(read)
  return unreadable === undefined ? Ok(read.flatMap((tally) => (tally.ok ? [tally.value] : []))) : Err(unreadable)
}

/**
 * The tallies of play MAXBET's CSV holds, in the file's order, its columns
 * found by the names in the first row, not by where they stand, or why it
 * is not taken in. Its CSV holds only the tallies MAXBET's screen was
 * narrowed to as it was written, so its backup is the file to take in.
 */
export const readMaxbetCsv = (text: string): Result<MaxbetTallies, MaxbetProblem> => andThen(readRows(text), playsOf)
