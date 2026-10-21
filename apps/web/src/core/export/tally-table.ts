import { toPlainString, type Decimal } from "../decimal/decimal"
import type { PlayGameKind } from "../play/play"
import type { TallyLine } from "../report/tally-line"
import { clockText } from "../tally/clock"

/**
 * The table's columns, as its first row names them. They are the file's
 * format, as the account names are the journal's: whoever opens the file
 * reads these words, and a column is added at the end, never renamed.
 */
const COLUMNS = [
  "営業日",
  "店舗",
  "種別",
  "機種",
  "台番号",
  "投資",
  "回収",
  "収支",
  "期待値",
  "推定期待値",
  "メーカー",
  "開始時刻",
  "終了時刻",
  "稼働時間",
  "大当り回数",
  "回転率",
  "開始時の持ち玉・持ちメダル",
  "推定の算出条件ID",
  "推定の貸玉単価",
  "推定の交換率",
  "推定の回転率",
  "送り主",
  "送り主ID",
  "摘要",
  "店舗ID",
  "稼働ID",
  "取込元",
] as const

const GAME_KINDS: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチンコ", slot: "スロット" }

/** What is not known is an empty cell, which a spreadsheet leaves out of a sum; a dash would be text in a column of numbers. */
const UNKNOWN = ""

const amountText = (amount: Decimal | undefined): string => (amount === undefined ? UNKNOWN : toPlainString(amount))

/** Seconds as hours and minutes, `5:20`, to the nearest minute: what a spreadsheet takes as a time, and what this app takes in as 稼働時間. */
const durationText = (seconds: Decimal | undefined): string => {
  if (seconds === undefined) return UNKNOWN
  const minutes = Math.round(Number(toPlainString(seconds)) / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}

const rowOf = (line: TallyLine): readonly string[] => [
  line.tally.date,
  line.parlorName ?? UNKNOWN,
  line.tally.gameKind === undefined ? UNKNOWN : GAME_KINDS[line.tally.gameKind],
  line.machineName ?? UNKNOWN,
  line.tally.cabinetNumber ?? UNKNOWN,
  toPlainString(line.sides.spent),
  toPlainString(line.sides.won),
  toPlainString(line.actual),
  amountText(line.tally.theoreticalValue),
  amountText(line.tally.inferredValue),
  line.maker ?? UNKNOWN,
  line.notes.aside.clock?.started === undefined ? UNKNOWN : clockText(line.notes.aside.clock.started),
  line.notes.aside.clock?.finished === undefined ? UNKNOWN : clockText(line.notes.aside.clock.finished),
  durationText(line.notes.playSeconds),
  line.notes.jackpots === undefined ? UNKNOWN : String(line.notes.jackpots),
  amountText(line.notes.aside.spinPerformance),
  amountText(line.notes.carriedIn),
  line.notes.inferredFormula ?? UNKNOWN,
  amountText(line.notes.tokenRental),
  amountText(line.notes.tokenExchange),
  amountText(line.notes.inferredSpinPerformance),
  line.notes.aside.sender?.name ?? UNKNOWN,
  line.notes.aside.sender?.id ?? UNKNOWN,
  line.tally.description,
  line.tally.parlorId ?? UNKNOWN,
  line.tally.id,
  line.tally.importedFrom ?? UNKNOWN,
]

/** Tallies as a table, a tally a row under the row of column names, in the order given. Amounts are plain numbers of yen, with no separators and no unit. */
export const tallyTableOf = (lines: readonly TallyLine[]): readonly (readonly string[])[] => [COLUMNS, ...lines.map(rowOf)]
