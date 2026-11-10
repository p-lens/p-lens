import { Err, Ok, type Result } from "../../core/result/result"
import { countOf, dayOf, gameKindOf, labelsOf, unreadableOf, yenOf, type RowField, type RowsUnreadable } from "../core/cells"
import { rowsOfCsv, type CsvProblem } from "../core/csv-rows"
import type { SourceTally } from "../core/source-tally"

/** パチフォリオ, as an imported tally says where it came from. */
export const PACHIFOLIO = "pachifolio"

/**
 * The columns パチフォリオ's CSV names in its first row. It keeps a tally in
 * yen, with no parlor or machine codes, no maker, cabinet or hours; its
 * 回転数 and 大当り are the person's own, a pachislot play's games and
 * ATs under the same names.
 */
const COLUMNS = {
  date: "日付",
  parlor: "店舗",
  machine: "機種",
  outlay: "投資",
  takings: "回収",
  gameKind: "種別",
  labels: "タグ",
  spins: "回転数",
  jackpots: "大当り",
  memo: "メモ",
} as const

type Column = keyof typeof COLUMNS

/** The columns a row cannot do without. */
const REQUIRED: readonly Column[] = ["date", "outlay", "takings"]

/**
 * Why a file is not taken in.
 *
 * - `not-pachifolio`: its first row does not name the columns a tally needs.
 * - `rows-unreadable`: these rows do not read.
 */
export type PachifolioProblem = { readonly type: "empty" } | { readonly type: "not-pachifolio"; readonly missing: readonly string[] } | RowsUnreadable | CsvProblem

const tallyOf = (cell: (column: Column) => string): Result<SourceTally, readonly RowField[]> => {
  const [date, outlay, takings, gameKind, spins, jackpots] = [dayOf(cell("date")), yenOf(cell("outlay")), yenOf(cell("takings")), gameKindOf(cell("gameKind")), countOf(cell("spins")), countOf(cell("jackpots"))]
  if (date === undefined || outlay === undefined || takings === undefined || !gameKind.ok || !spins.ok || !jackpots.ok)
    return Err([
      ...(date === undefined ? (["date"] as const) : []),
      ...(outlay === undefined ? (["outlay"] as const) : []),
      ...(takings === undefined ? (["takings"] as const) : []),
      ...(gameKind.ok ? [] : (["gameKind"] as const)),
      ...(spins.ok ? [] : (["countedSpins"] as const)),
      ...(jackpots.ok ? [] : (["countedJackpots"] as const)),
    ])
  return Ok({
    date,
    parlor: { name: cell("parlor").trim(), code: "" },
    machine: { name: cell("machine").trim(), code: "", maker: "" },
    cabinetNumber: "",
    outlay,
    takings,
    memo: cell("memo").trim(),
    hours: undefined,
    gameKind: gameKind.value,
    countedSpins: spins.value,
    countedJackpots: jackpots.value,
    sourceLabels: labelsOf(cell("labels")),
  })
}

/**
 * The tallies a パチフォリオ CSV holds, in the file's order, or why it is
 * not taken in. Columns are found by the names in the first row, not by
 * where they stand, and a column the file lacks reads as empty unless a
 * tally cannot do without it.
 */
export const readPachifolio = (text: string): Result<readonly SourceTally[], PachifolioProblem> => {
  const csv = rowsOfCsv(text)
  if (!csv.ok) return csv
  const [header, ...rows] = csv.value
  if (header === undefined) return Err({ type: "empty" })
  const names = header.map((name) => name.trim())
  const missing = REQUIRED.filter((column) => !names.includes(COLUMNS[column])).map((column) => COLUMNS[column])
  if (missing.length > 0) return Err({ type: "not-pachifolio", missing })
  if (rows.length === 0) return Err({ type: "empty" })
  const read = rows.map((row) => tallyOf((column) => row[names.indexOf(COLUMNS[column])] ?? ""))
  const unreadable = unreadableOf(read)
  return unreadable === undefined ? Ok(read.flatMap((tally) => (tally.ok ? [tally.value] : []))) : Err(unreadable)
}
