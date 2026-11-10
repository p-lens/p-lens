import type { Decimal } from "../../core/decimal/decimal"
import { Err, Ok, type Result } from "../../core/result/result"
import { dayOf, hoursOf, signedYenOf, yenOf, type RowField, type RowsUnreadable } from "../core/cells"
import { rowsOfCsv, type CsvProblem } from "../core/csv-rows"
import type { SourceTally } from "../core/source-tally"

/** Myパチ収支表, as an imported tally says where it came from. */
export const MYPACHI = "mypachi"

/**
 * The columns Myパチ収支表's 件別収支表 names in its row of column names. 収支
 * and 時給 are there too and are not read, following from what is; nor is
 * 画像, which says only whether a picture was kept. It names no game.
 */
const COLUMNS = {
  date: "日",
  parlor: "店",
  machine: "台",
  hours: "稼働",
  outlay: "投資",
  takings: "回収",
  memo: "コメント",
  labels: "タグ",
  theoreticalValue: "期待値",
} as const

type Column = keyof typeof COLUMNS

/** The columns a row cannot do without. */
const REQUIRED: readonly Column[] = ["date", "outlay", "takings"]

/**
 * Why a file is not taken in.
 *
 * - `unreadable-text`: its bytes read neither as Shift_JIS, as Myパチ収支表
 *   writes it, nor as UTF-8, as a person may have saved it again.
 * - `not-mypachi`: no row names the columns a tally needs.
 * - `rows-unreadable`: these rows do not read.
 */
export type MypachiProblem = { readonly type: "empty" } | { readonly type: "unreadable-text" } | { readonly type: "not-mypachi"; readonly missing: readonly string[] } | RowsUnreadable | CsvProblem

const decoded = (bytes: Uint8Array, encoding: string): string | undefined => {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

/** A file's bytes as text: UTF-8 where they read as it, or else Shift_JIS, as Myパチ収支表 writes them. */
const textOf = (bytes: Uint8Array): string | undefined => decoded(bytes, "utf-8") ?? decoded(bytes, "shift_jis")

/** A day as Myパチ収支表 writes it, its day of the week after it, `2026/11/09(月)`. */
const dayOfDated = (text: string): ReturnType<typeof dayOf> => dayOf(text.trim().replace(/[(（][^)）]*[)）]$/, ""))

/** A sum of yen with the yen sign Shift_JIS writes as a backslash taken off before it, `\+892`. */
const unmarked = (text: string): string => text.trim().replace(/^([-+−]?)\\/, "$1").replace(/^\\/, "")

/** A sum of yen Myパチ収支表 writes, `\50000`; an empty one as none. */
const yenOfCell = (text: string): Decimal | undefined => yenOf(unmarked(text))

/** A theoretical value as Myパチ収支表 writes a signed sum, `\+892`: none where it is empty, and a cell that says something else does not read. */
const theoreticalValueOf = (text: string): Result<Decimal | undefined, "unread"> => {
  if (text.trim() === "") return Ok(undefined)
  const value = signedYenOf(unmarked(text))
  return value === undefined ? Err("unread") : Ok(value)
}

/** A tally's labels, its タグ broken at its spaces, full-width or half: each once, in the cell's order. */
const labelsOf = (text: string): readonly string[] => [...new Set(text.split(/[\s　]+/))].filter((label) => label !== "")

const fieldIf = (failed: boolean, field: RowField): readonly RowField[] => (failed ? [field] : [])

const tallyOf = (cell: (column: Column) => string): Result<SourceTally, readonly RowField[]> => {
  const [date, outlay, takings, hours, worth] = [dayOfDated(cell("date")), yenOfCell(cell("outlay")), yenOfCell(cell("takings")), hoursOf(cell("hours")), theoreticalValueOf(cell("theoreticalValue"))]
  if (date === undefined || outlay === undefined || takings === undefined || !hours.ok || !worth.ok)
    return Err([...fieldIf(date === undefined, "date"), ...fieldIf(outlay === undefined, "outlay"), ...fieldIf(takings === undefined, "takings"), ...fieldIf(!hours.ok, "hours"), ...fieldIf(!worth.ok, "theoreticalValue")])
  return Ok({
    date,
    parlor: { name: cell("parlor").trim(), code: "" },
    machine: { name: cell("machine").trim(), code: "", maker: "" },
    cabinetNumber: "",
    outlay,
    takings,
    memo: cell("memo").trim(),
    hours: hours.value,
    clock: undefined,
    theoreticalValue: worth.value,
    gameKind: undefined,
    countedSpins: undefined,
    countedJackpots: undefined,
    sourceLabels: labelsOf(cell("labels")),
  })
}

const namesOf = (row: readonly string[]): readonly string[] => row.map((name) => name.trim())

const namesColumns = (row: readonly string[]): boolean => REQUIRED.every((column) => namesOf(row).includes(COLUMNS[column]))

/** A row that is no tally: empty, or the line Myパチ収支表 ends its file with, 作成日時 and when. */
const isTallyless = (row: readonly string[]): boolean => row.every((cell) => cell.trim() === "" || cell.trim().startsWith("作成日時"))

/** The names a tally needs that no row of a file names. */
const missingOf = (rows: readonly (readonly string[])[]): readonly string[] => REQUIRED.map((column) => COLUMNS[column]).filter((name) => !rows.some((row) => namesOf(row).includes(name)))

/** The rows that do not read, by their line in the file, or none where every row does: the lines are counted from the file's first, its title. */
const unreadableOf = (read: readonly { readonly line: number; readonly tally: Result<SourceTally, readonly RowField[]> }[]): RowsUnreadable | undefined => {
  const rows = read.flatMap((row) => (row.tally.ok ? [] : [{ line: row.line, fields: row.tally.error }]))
  return rows.length === 0 ? undefined : { type: "rows-unreadable", rows }
}

/**
 * The tallies a 件別収支表 Myパチ収支表 writes holds, in the file's order, or
 * why it is not taken in. Its title comes before the row of column names,
 * which is found by the names a tally needs, and the columns by the names
 * in it, not by where they stand; a column the file lacks reads as empty
 * unless a tally cannot do without it. The row it ends with, saying when
 * it was made, is no tally.
 */
export const readMypachi = (bytes: Uint8Array): Result<readonly SourceTally[], MypachiProblem> => {
  const text = textOf(bytes)
  if (text === undefined) return Err({ type: "unreadable-text" })
  const csv = rowsOfCsv(text)
  if (!csv.ok) return csv
  const at = csv.value.findIndex(namesColumns)
  if (at < 0) return csv.value.length === 0 ? Err({ type: "empty" }) : Err({ type: "not-mypachi", missing: missingOf(csv.value) })
  const names = namesOf(csv.value[at] ?? [])
  const read = csv.value.flatMap((row, index) => (index <= at || isTallyless(row) ? [] : [{ line: index + 1, tally: tallyOf((column) => row[names.indexOf(COLUMNS[column])] ?? "") }]))
  if (read.length === 0) return Err({ type: "empty" })
  const unreadable = unreadableOf(read)
  return unreadable === undefined ? Ok(read.flatMap((row) => (row.tally.ok ? [row.tally.value] : []))) : Err(unreadable)
}
