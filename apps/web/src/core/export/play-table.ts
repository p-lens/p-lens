import { toPlainString } from "../decimal/decimal"
import type { PlayGameKind } from "../play/play"
import type { PlayLine } from "../report/play-line"

/**
 * The table's columns, as its first row names them. They are the file's
 * format, as the account names are the journal's: whoever opens the file
 * reads these words, and a column is added at the end, never renamed.
 */
const COLUMNS = ["営業日", "店舗", "種別", "機種", "台番号", "投資", "回収", "収支", "期待値"] as const

const GAME_KINDS: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチンコ", slot: "スロット" }

/** What is not known is an empty cell, which a spreadsheet leaves out of a sum; a dash would be text in a column of numbers. */
const UNKNOWN = ""

const rowOf = (line: PlayLine): readonly string[] => [
  line.play.date,
  line.parlorName ?? UNKNOWN,
  line.play.gameKind === undefined ? UNKNOWN : GAME_KINDS[line.play.gameKind],
  line.machineName ?? UNKNOWN,
  line.play.cabinetNumber ?? UNKNOWN,
  toPlainString(line.sides.spent),
  toPlainString(line.sides.won),
  toPlainString(line.actual),
  line.play.theoreticalValue === undefined ? UNKNOWN : toPlainString(line.play.theoreticalValue),
]

/** Plays as a table, a play a row under the row of column names, in the order given. Amounts are plain numbers of yen, with no separators and no unit. */
export const playTableOf = (lines: readonly PlayLine[]): readonly (readonly string[])[] => [COLUMNS, ...lines.map(rowOf)]
