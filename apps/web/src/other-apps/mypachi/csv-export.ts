import type { IsoDate } from "../../core/calendar/calendar"
import { rounded, toPlainString, type Decimal } from "../../core/decimal/decimal"
import type { PlayId } from "../../core/play/play"
import type { TallyLine } from "../../core/report/tally-line"
import { bareCsvOf } from "../core/csv"
import { wholeSidesOf } from "../core/whole-sides"

/** The row Myパチ収支表's 件別収支表 begins with: its own name, and the table's. */
const TITLE = ["Myパチ収支表", "件別収支表"] as const

/** The columns its 件別収支表 names, in its order. */
const COLUMNS = ["日", "店", "台", "稼働", "投資", "回収", "収支", "時給", "コメント", "タグ", "画像", "期待値"] as const

const EMPTY = ""

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const

/** A day as Myパチ収支表 writes it, its day of the week after it, `2026/11/09(月)`. */
const dayOf = (date: IsoDate): string => {
  const [year, month, day] = date.split("-").map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay()] ?? ""
  return `${date.replaceAll("-", "/")}(${weekday})`
}

/** A sum of yen as Myパチ収支表 writes one, its yen sign before it — a backslash, once in Shift_JIS — `\50000`. */
const yenText = (amount: Decimal): string => `\\${toPlainString(amount)}`

/** A result as Myパチ収支表 writes one, signed where it is not nothing: `\+892`, `\-50000`, `\0`. */
const signedText = (amount: Decimal): string => `\\${amount.mantissa > 0n ? "+" : ""}${toPlainString(amount)}`

/** A play's seconds as the tenths of an hour Myパチ収支表 keeps under 稼働; none where its time is not known. */
const tenthsOf = (seconds: Decimal | undefined): bigint | undefined => (seconds === undefined ? undefined : BigInt(Math.round(Number(toPlainString(seconds)) / 360)))

/** Tenths of an hour as Myパチ収支表 writes them, a whole hour without its tenth: `0.8`, `1`. */
const hoursText = (tenths: bigint | undefined): string => (tenths === undefined ? EMPTY : tenths % 10n === 0n ? String(tenths / 10n) : `${tenths / 10n}.${tenths % 10n}`)

/** A tally's 時給 as Myパチ収支表 works it out: its result over its hours as written, short of the next yen; empty where it has no hours. */
const hourlyText = (result: Decimal, tenths: bigint | undefined): string => (tenths === undefined || tenths === 0n ? EMPTY : signedText({ mantissa: (rounded(result, 0).mantissa * 10n) / tenths, places: 0 }))

/** A tally's theoretical value in whole yen, as its result is written: the one measured or given, or else the one inferred; empty where it has neither. */
const worthOf = (line: TallyLine): string => ((worth) => (worth === undefined ? EMPTY : signedText(rounded(worth, 0))))(line.tally.theoreticalValue ?? line.tally.inferredValue)

const rowOf = (notes: ReadonlyMap<PlayId, string>) => (line: TallyLine): readonly string[] => {
  const sides = wholeSidesOf(line)
  const tenths = tenthsOf(line.notes.playSeconds)
  return [
    dayOf(line.tally.date),
    line.parlorName ?? EMPTY,
    line.machineName ?? EMPTY,
    hoursText(tenths),
    yenText(sides.outlay),
    yenText(sides.takings),
    signedText(sides.result),
    hourlyText(sides.result, tenths),
    notes.get(line.tally.id) ?? EMPTY,
    line.labels.join("　"),
    EMPTY,
    worthOf(line),
  ]
}

const twoDigits = (value: number): string => String(value).padStart(2, "0")

/** The row its file ends with, saying when it was made, in the device's own time, in its last column. */
const madeRow = (now: number): readonly string[] => {
  const at = new Date(now)
  const made = `作成日時 : ${at.getFullYear()}/${twoDigits(at.getMonth() + 1)}/${twoDigits(at.getDate())} ${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}:${twoDigits(at.getSeconds())}`
  return [...COLUMNS.slice(1).map(() => EMPTY), made]
}

/**
 * Tallies as the 件別収支表 Myパチ収支表 writes, a tally a row in the order
 * given, between its title and its column names above and the row saying
 * when it was made below: in a text to be written in Shift_JIS, as its
 * own is, a cell quoted only where it must be, each line ended in CRLF.
 * Myパチ収支表 takes no file in, so it is for a person to set beside one
 * of its own. A tally's コメント is the notes under its entry, by its
 * play's id (`tallyNotesIn`), never its description; its タグ its labels
 * with a full-width space between them.
 */
export const mypachiCsvOf = (lines: readonly TallyLine[], notes: ReadonlyMap<PlayId, string>, now: number): string => bareCsvOf([TITLE, COLUMNS, ...lines.map(rowOf(notes)), madeRow(now)], "\r\n")
