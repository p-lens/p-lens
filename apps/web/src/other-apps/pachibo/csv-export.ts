import type { IsoDate } from "../../core/calendar/calendar"
import { toPlainString } from "../../core/decimal/decimal"
import type { PlayGameKind, PlayId } from "../../core/play/play"
import type { TallyLine } from "../../core/report/tally-line"
import { bareCsvOf } from "../core/csv"
import { wholeSidesOf } from "../core/whole-sides"
import { minutesOf, oldestFirst } from "./lines"

/** The columns ぱち簿's CSV names in its first row, in its order. */
const COLUMNS = ["日付", "ホール", "タイプ", "機種", "投資", "回収", "収支", "時間", "メモ"] as const

const EMPTY = ""

/** A game as ぱち簿's タイプ names it. */
const GAME_KINDS: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチンコ", pachislot: "スロット" }

/** A day as ぱち簿 writes it in its CSV, its month and day without their zeros: `2026/11/4`. */
const csvDayOf = (date: IsoDate): string => date.split("-").map((part, index) => (index === 0 ? part : String(Number(part)))).join("/")

/** A length in minutes as ぱち簿's CSV writes it, hours and minutes on a clock: `9:40`, `0:05`. */
const lengthText = (minutes: number): string => `${String(Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, "0")}`

/** A memo on the one line a CSV row gives it. */
const oneLine = (memo: string): string => memo.replace(/[\r\n]+/g, " ")

const csvRowOf = (notes: ReadonlyMap<PlayId, string>) => (line: TallyLine): readonly string[] => {
  const sides = wholeSidesOf(line)
  const minutes = minutesOf(line.notes.playSeconds)
  return [
    csvDayOf(line.tally.date),
    line.parlorName ?? EMPTY,
    line.tally.gameKind === undefined ? EMPTY : GAME_KINDS[line.tally.gameKind],
    line.machineName ?? EMPTY,
    toPlainString(sides.outlay),
    toPlainString(sides.takings),
    toPlainString(sides.result),
    minutes === undefined ? EMPTY : lengthText(minutes),
    oneLine(notes.get(line.tally.id) ?? EMPTY),
  ]
}

/**
 * Tallies as the CSV ぱち簿 writes and takes back, a tally a row, oldest
 * first as ぱち簿 lists them: no byte order mark, a cell quoted only where
 * it must be, each line ended in LF — text that goes as Shift_JIS, as
 * ぱち簿's own does. 投資 is the tally's expenses and 収支 its total, each
 * to the yen, and 回収 the two added. メモ is the notes under its entry.
 */
export const pachiboCsvOf = (lines: readonly TallyLine[], notes: ReadonlyMap<PlayId, string>): string => bareCsvOf([COLUMNS, ...oldestFirst(lines).map(csvRowOf(notes))], "\n")
