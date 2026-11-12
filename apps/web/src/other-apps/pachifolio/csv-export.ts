import { toPlainString } from "../../core/decimal/decimal"
import type { PlayGameKind, PlayId } from "../../core/play/play"
import type { TallyLine } from "../../core/report/tally-line"
import { csvOf } from "../core/csv"
import { wholeSidesOf } from "../core/whole-sides"

/** The columns パチフォリオ's CSV names in its first row, in its order. */
const COLUMNS = ["日付", "店舗", "機種", "投資", "回収", "種別", "タグ", "回転数", "大当り", "メモ"] as const

const EMPTY = ""

/** A game as パチフォリオ's 種別 names it. */
const GAME_KINDS: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチ", pachislot: "スロ" }

/** A day as パチフォリオ writes it, `2026/11/08`. */
const dayOf = (line: TallyLine): string => line.tally.date.replaceAll("-", "/")

/**
 * The spins and jackpots of a tally as パチフォリオ counts them under its
 * 回転数 and 大当り: a pachinko play's regular spins and net jackpots —
 * no spin of a 確変, 時短 or 残保留, and none where a tally written before
 * regular spins were kept does not say them — a pachislot play's net
 * games and its net ATs or net bonuses, as its log counted them; and where
 * no log did, the jackpots told of it by hand.
 */
const countCellsOf = (line: TallyLine): readonly [string, string] => {
  const counts = line.notes.aside.netCounts
  const told = line.notes.netJackpots === undefined ? EMPTY : String(line.notes.netJackpots)
  if (counts === undefined) return [EMPTY, told]
  switch (counts.type) {
    case "pachinko":
      return [counts.regularSpins === undefined ? EMPTY : String(counts.regularSpins), String(counts.jackpots)]
    case "at-machine":
      return [String(counts.games), String(counts.ats)]
    case "bonus-machine":
      return [String(counts.games), String(counts.bonuses)]
    case "games":
      return [String(counts.games), EMPTY]
  }
}

const rowOf = (notes: ReadonlyMap<PlayId, string>) => (line: TallyLine): readonly string[] => {
  const sides = wholeSidesOf(line)
  return [
    dayOf(line),
    line.parlorName ?? EMPTY,
    line.machineName ?? EMPTY,
    toPlainString(sides.outlay),
    toPlainString(sides.takings),
    line.tally.gameKind === undefined ? EMPTY : GAME_KINDS[line.tally.gameKind],
    EMPTY,
    ...countCellsOf(line),
    notes.get(line.tally.id) ?? EMPTY,
  ]
}

/**
 * Tallies as the CSV パチフォリオ writes, a tally a row in the order given
 * under the row of column names: UTF-8 with a byte order mark, a cell
 * quoted only where it must be, each line ended in LF, as its own file
 * is. Its タグ are left empty: this app keeps no labels of its own yet. A
 * tally's メモ is the notes under its entry, by its play's id
 * (`tallyNotesIn`), never its description.
 */
export const pachifolioCsvOf = (lines: readonly TallyLine[], notes: ReadonlyMap<PlayId, string>): string => csvOf([COLUMNS, ...lines.map(rowOf(notes))], "\n")
