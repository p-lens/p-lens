import { rounded, toPlainString, type Decimal } from "../../core/decimal/decimal"
import type { PlayGameKind, PlayId } from "../../core/play/play"
import type { TallyLine } from "../../core/report/tally-line"
import type { ClockTime } from "../../core/tally/tally"
import { bareCsvOf } from "../core/csv"
import { wholeSidesOf } from "../core/whole-sides"
import { gameKindOfStake } from "./stake"

/** The columns マネクルSP's import guide asks a file's first row to name, in its order and as it writes them. */
const COLUMNS = ["日付", "開始（時）", "開始（分）", "終了（時）", "終了（分）", "稼働時間(分間)", "投資金額", "回収金額", "期待値", "投資種類", "店舗", "機種", "タグ", "メモ"] as const

const EMPTY = ""

/** A game as a 投資種類 names it where the tally has no label of its own that says the game. */
const STAKES: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチンコ", pachislot: "スロット" }

/** A day as マネクルSP's guide asks for it, `2026/11/08`. */
const dayOf = (line: TallyLine): string => line.tally.date.replaceAll("-", "/")

const timeCells = (time: ClockTime | undefined): readonly [string, string] => (time === undefined ? [EMPTY, EMPTY] : [String(time.hour), String(time.minute)])

/** A play's seconds as the whole minutes マネクルSP keeps under 稼働時間. */
const minutesOf = (seconds: Decimal | undefined): string => (seconds === undefined ? EMPTY : String(Math.round(Number(toPlainString(seconds)) / 60)))

/**
 * A tally's theoretical value in whole yen: the one measured or given, or
 * else the one inferred; empty where it has neither, which マネクルSP fills
 * with the result as its みなし期待値.
 */
const worthOf = (line: TallyLine): string => ((worth) => (worth === undefined ? EMPTY : toPlainString(rounded(worth, 0))))(line.tally.theoreticalValue ?? line.tally.inferredValue)

/**
 * A tally's 投資種類 and its タグ: the first of its labels that says the
 * tally's game, as one taken in from マネクルSP keeps the 投資種類 it had,
 * or else the game's own word, and every other label as a タグ, `タグ1/タグ2`.
 */
const stakeAndLabels = (line: TallyLine): readonly [string, string] => {
  const gameKind = line.tally.gameKind
  const stake = gameKind === undefined ? undefined : (line.labels.find((label) => gameKindOfStake(label) === gameKind) ?? STAKES[gameKind])
  return [stake ?? EMPTY, line.labels.filter((label) => label !== stake).join("/")]
}

/** A note with its lines broken as マネクルSP breaks a memo's, by `<br/>`. */
const memoOf = (note: string | undefined): string => (note === undefined ? EMPTY : note.split(/\r?\n/).join("<br/>"))

const rowOf = (notes: ReadonlyMap<PlayId, string>) => (line: TallyLine): readonly string[] => {
  const sides = wholeSidesOf(line)
  const clock = line.notes.aside.clock
  const [stake, labels] = stakeAndLabels(line)
  return [
    dayOf(line),
    ...timeCells(clock?.started),
    ...timeCells(clock?.finished),
    minutesOf(line.notes.playSeconds),
    toPlainString(sides.outlay),
    toPlainString(sides.takings),
    worthOf(line),
    stake,
    line.parlorName ?? EMPTY,
    line.machineName ?? EMPTY,
    labels,
    memoOf(notes.get(line.tally.id)),
  ]
}

/**
 * Tallies as the CSV マネクルSP's import takes, a tally a row in the order
 * given under the row of column names: UTF-8 with no byte order mark —
 * UTF-8 is all it reads, and nothing says it reads the mark — a cell
 * quoted only where it must be, each line ended in LF. A tally's メモ is
 * the notes under its entry, by its play's id (`tallyNotesIn`), never its
 * description.
 */
export const manekuruCsvOf = (lines: readonly TallyLine[], notes: ReadonlyMap<PlayId, string>): string => bareCsvOf([COLUMNS, ...lines.map(rowOf(notes))], "\n")
