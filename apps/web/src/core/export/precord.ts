import type { IsoDate } from "../calendar/calendar"
import { ZERO, add, compare, decimal, isZero, multiply, negate, quotient, rounded, toPlainString, type Decimal } from "../decimal/decimal"
import type { PlayGameKind, PlayId } from "../play/play"
import type { TallyLine } from "../report/tally-line"

/**
 * The columns pRecord's import guide lists, as its first row names them and
 * in its order: its own export, and the guide's sample, leave out 種別,
 * which its import takes in all the same.
 */
const COLUMNS = ["日付", "店舗コード", "店舗", "メーカー", "機種コード", "機種", "種別", "台番号", "投資額", "回収額", "収支", "メモ", "稼働時間", "時給", "経費"] as const

/** What is not known, or not this app's to say: pRecord's own codes for a parlor and a machine are left empty, as its guide asks of a file from another app. */
const EMPTY = ""

/** A sum of yen pRecord keeps beside a tally that no tally here has. */
const NO_EXPENSE = "0"

/** A game as pRecord's 種別 names it. */
const GAME_KINDS: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチンコ", pachislot: "パチスロ" }

const SECONDS_IN_AN_HOUR = decimal(3600n, 0)

const SECONDS_IN_A_MINUTE = 60n

const MINUTES_IN_AN_HOUR = 60n

/** How many places pRecord writes its 時給 to. */
const HOURLY_PLACES = 3

/** A day as pRecord writes it, `2026/10/11`. */
const dayOf = (date: IsoDate): string => date.replaceAll("-", "/")

/** A number as pRecord writes a fraction, with a point always: `2.25`, `2.0`. */
const pointed = (value: Decimal): string => ((plain) => (plain.includes(".") ? plain : `${plain}.0`))(toPlainString(value))

const larger = (left: Decimal, right: Decimal): Decimal => (compare(left, right) >= 0 ? left : right)

/** A tally's two sides in whole yen, as pRecord takes them in. */
interface WholeSides {
  readonly outlay: Decimal
  readonly takings: Decimal
  readonly result: Decimal
}

/**
 * A tally's two sides in whole yen, so that what came back less what went
 * in is its 収支 as this app shows it, to the yen, and neither is below
 * nothing: what went in is the expenses rounded, raised where a hand-written
 * entry would leave it short of a loss or below nothing.
 */
const wholeSidesOf = (line: TallyLine): WholeSides => {
  const result = rounded(line.actual, 0)
  const outlay = [rounded(line.sides.spent, 0), negate(result)].reduce(larger, ZERO)
  return { outlay, takings: add(outlay, result), result }
}

/** A length to the nearest minute as a person writes it: `2時間35分`, `2時間`, `45分`. */
const lengthText = (seconds: Decimal): string => {
  const minutes = (rounded(seconds, 0).mantissa + SECONDS_IN_A_MINUTE / 2n) / SECONDS_IN_A_MINUTE
  const hours = minutes / MINUTES_IN_AN_HOUR
  const left = minutes % MINUTES_IN_AN_HOUR
  return hours === 0n ? `${left}分` : left === 0n ? `${hours}時間` : `${hours}時間${left}分`
}

/**
 * How long a tally's play lasted, and its 収支 an hour. pRecord's import
 * takes 稼働時間 into the tally's memo, so it is written in words a person
 * reads there, and left empty where the length is not known; 時給 is
 * written as pRecord writes it, nought where the length is not known.
 */
const timeCellsOf = (seconds: Decimal | undefined, result: Decimal): readonly [string, string] =>
  seconds === undefined || isZero(seconds) ? [EMPTY, pointed(ZERO)] : [lengthText(seconds), pointed(quotient(multiply(result, SECONDS_IN_AN_HOUR), seconds, HOURLY_PLACES))]

const rowOf = (notes: ReadonlyMap<PlayId, string>) => (line: TallyLine): readonly string[] => {
  const sides = wholeSidesOf(line)
  return [
    dayOf(line.tally.date),
    EMPTY,
    line.parlorName ?? EMPTY,
    line.maker ?? EMPTY,
    EMPTY,
    line.machineName ?? EMPTY,
    line.tally.gameKind === undefined ? EMPTY : GAME_KINDS[line.tally.gameKind],
    line.tally.cabinetNumber ?? EMPTY,
    toPlainString(sides.outlay),
    toPlainString(sides.takings),
    toPlainString(sides.result),
    notes.get(line.tally.id) ?? EMPTY,
    ...timeCellsOf(line.notes.playSeconds, sides.result),
    NO_EXPENSE,
  ]
}

/** A cell as pRecord writes every one: in quotes, a quote inside doubled. */
const quoted = (text: string): string => `"${text.replaceAll('"', '""')}"`

/**
 * Tallies as the CSV pRecord's データインポート takes in, a tally a row in
 * the order given under the row of column names: UTF-8 with no byte order
 * mark, every cell quoted, each line ended in CRLF, as its guide asks. A
 * tally's メモ is the notes under its entry, by its play's id
 * (`tallyNotesIn`), never its description, whose note is the machine and
 * cabinet the file has columns of its own for.
 */
export const precordCsvOf = (lines: readonly TallyLine[], notes: ReadonlyMap<PlayId, string>): string => [COLUMNS, ...lines.map(rowOf(notes))].map((row) => `${row.map(quoted).join(",")}\r\n`).join("")
