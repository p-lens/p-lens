import { toPlainString } from "../decimal/decimal"
import type { PlayGameKind } from "../play/play"
import type { TallyLine } from "../report/tally-line"

/**
 * The table's columns, as its first row names them. They are the file's
 * format, as the account names are the journal's: whoever opens the file
 * reads these words, and a column is added at the end, never renamed.
 */
const COLUMNS = ["営業日", "店舗", "種別", "機種", "台番号", "投資", "回収", "収支", "期待値"] as const

const GAME_KINDS: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチンコ", slot: "スロット" }

/** What is not known is an empty cell, which a spreadsheet leaves out of a sum; a dash would be text in a column of numbers. */
const UNKNOWN = ""

const rowOf = (line: TallyLine): readonly string[] => [
  line.tally.date,
  line.parlorName ?? UNKNOWN,
  line.tally.gameKind === undefined ? UNKNOWN : GAME_KINDS[line.tally.gameKind],
  line.machineName ?? UNKNOWN,
  line.tally.cabinetNumber ?? UNKNOWN,
  toPlainString(line.sides.spent),
  toPlainString(line.sides.won),
  toPlainString(line.actual),
  line.tally.theoreticalValue === undefined ? UNKNOWN : toPlainString(line.tally.theoreticalValue),
]

/** Tallies as a table, a tally a row under the row of column names, in the order given. Amounts are plain numbers of yen, with no separators and no unit. */
export const tallyTableOf = (lines: readonly TallyLine[]): readonly (readonly string[])[] => [COLUMNS, ...lines.map(rowOf)]
