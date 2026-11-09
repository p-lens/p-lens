import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { decimal, parseDecimal, type Decimal } from "../decimal/decimal"
import type { PlayGameKind } from "../play/play"
import { Err, Ok, type Result } from "../result/result"

const DAY = /^(\d{4})(?:[/-](\d{1,2})[/-](\d{1,2})|年(\d{1,2})月(\d{1,2})日)$/

/** A day as another app writes it in a cell, `2019/01/02`; one written without its zeros, with hyphens, or as `2019年1月2日` is the same day. */
export const dayOf = (text: string): IsoDate | undefined => {
  const read = DAY.exec(text.trim())
  const parsed = read === null ? undefined : parseIsoDate(`${read[1] ?? ""}-${(read[2] ?? read[4] ?? "").padStart(2, "0")}-${(read[3] ?? read[5] ?? "").padStart(2, "0")}`)
  return parsed?.ok === true ? parsed.value : undefined
}

const WHOLE = /^\d+$/

/** A cell's sum of yen with what a person writes around it taken off: commas, a yen sign before it or 円 after it. */
const plainYen = (text: string): string => text.trim().replaceAll(",", "").replace(/^[¥￥]/, "").replace(/円$/, "").trim()

/** A sum of yen as typed into a cell: whole, not below nothing, commas, a yen sign or 円 allowed. */
export const yenOf = (text: string): Decimal | undefined => {
  const plain = plainYen(text)
  const parsed = WHOLE.test(plain) ? parseDecimal(plain) : undefined
  return parsed?.ok === true ? parsed.value : undefined
}

const SIGNED = /^([-+−]?)(\d+)$/

/** A result in yen as typed into a cell: whole, below nothing where it is signed so — a minus or its typeset twin — commas, a yen sign or 円 allowed. */
export const signedYenOf = (text: string): Decimal | undefined => {
  const read = SIGNED.exec(plainYen(text.trim().replace(/^([-+−])\s*[¥￥]/, "$1")))
  const parsed = read === null ? undefined : parseDecimal(`${read[1] === "" || read[1] === "+" ? "" : "-"}${read[2] ?? ""}`)
  return parsed?.ok === true ? parsed.value : undefined
}

/**
 * A count as typed into a cell — spins, jackpots — whole, not below
 * nothing, commas allowed: none where the cell is empty, and a cell that
 * says something else does not read.
 */
export const countOf = (text: string): Result<number | undefined, "unread"> => {
  const plain = text.trim().replaceAll(",", "")
  if (plain === "") return Ok(undefined)
  return WHOLE.test(plain) && Number.isSafeInteger(Number(plain)) ? Ok(Number(plain)) : Err("unread")
}

const CLOCK = /^(\d{1,2}):(\d{2})(?::\d{2})?$/

const HOURS = /^\d+(\.\d+)?$/

const SPOKEN = /^(?:(\d+)時間)?(?:(\d+)分)?$/

/**
 * How long a tally's play lasted, in hours to the hundredth, as pRecord writes it
 * and a person's own file may:
 * a number of hours — `2.4166667` is two hours and twenty-five minutes,
 * its own 時給 the result over it — or, should a file have it so, a
 * clock's `2:25`, or words, `2時間25分`, as this app writes a file for
 * pRecord, whose import takes the cell into the memo. None where the cell
 * is empty or comes to no time at all: a tally is taken in without its
 * hours rather than refused for them. A
 * cell that says something and does not read as hours is no such thing,
 * and the row does not read.
 */
export const hoursOf = (text: string): Result<Decimal | undefined, "unread"> => {
  const plain = text.trim()
  if (plain === "") return Ok(undefined)
  const clock = CLOCK.exec(plain) ?? SPOKEN.exec(plain)
  if (clock === null && !HOURS.test(plain)) return Err("unread")
  const hours = clock === null ? Number(plain) : Number(clock[1] ?? 0) + Number(clock[2] ?? 0) / 60
  const hundredths = Math.round(hours * 100)
  return Ok(hundredths > 0 ? decimal(BigInt(hundredths), 2) : undefined)
}

/** The words a 種別 says each game by, as パチフォリオ writes them and a person's own file may. */
const GAME_KINDS: Readonly<Record<string, PlayGameKind>> = { パチ: "pachinko", パチンコ: "pachinko", P: "pachinko", スロ: "pachislot", スロット: "pachislot", パチスロ: "pachislot", S: "pachislot" }

/** The game a 種別 says: none where the cell is empty, and a cell that says something else does not read. */
export const gameKindOf = (text: string): Result<PlayGameKind | undefined, "unread"> => {
  const plain = text.trim()
  if (plain === "") return Ok(undefined)
  const found = GAME_KINDS[plain]
  return found === undefined ? Err("unread") : Ok(found)
}

const LABEL_BREAK = /[,，、]/

/** The labels a cell holds, as パチフォリオ writes them, `イベント,朝一`: each once, in the cell's order. */
export const labelsOf = (text: string): readonly string[] => [...new Set(text.split(LABEL_BREAK).map((label) => label.trim()))].filter((label) => label !== "")

/** What of a row could not be read, whichever app wrote it. */
export type RowField = "date" | "outlay" | "takings" | "result" | "hours" | "gameKind" | "countedSpins" | "countedJackpots"

/** Rows that do not read, by their line in the file, each with what of it does not. Nothing of a file is taken in while any row of it does not. */
export interface RowsUnreadable {
  readonly type: "rows-unreadable"
  readonly rows: readonly { readonly line: number; readonly fields: readonly RowField[] }[]
}

/** The rows of a file that do not read, by their line — the first row names the columns — or none where every row does. */
export const unreadableOf = <T>(read: readonly Result<T, readonly RowField[]>[]): RowsUnreadable | undefined => {
  const rows = read.flatMap((row, index) => (row.ok ? [] : [{ line: index + 2, fields: row.error }]))
  return rows.length === 0 ? undefined : { type: "rows-unreadable", rows }
}
