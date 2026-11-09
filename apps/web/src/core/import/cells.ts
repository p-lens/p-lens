import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { parseDecimal, type Decimal } from "../decimal/decimal"
import { Err, Ok, type Result } from "../result/result"

const DAY = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/

/** A day as another app writes it in a cell, `2019/01/02`; one written without its zeros, or with hyphens, is the same day. */
export const dayOf = (text: string): IsoDate | undefined => {
  const read = DAY.exec(text.trim())
  const parsed = read === null ? undefined : parseIsoDate(`${read[1] ?? ""}-${(read[2] ?? "").padStart(2, "0")}-${(read[3] ?? "").padStart(2, "0")}`)
  return parsed?.ok === true ? parsed.value : undefined
}

const WHOLE = /^\d+$/

/** A sum of yen as typed into a cell: whole, not below nothing, commas allowed. */
export const yenOf = (text: string): Decimal | undefined => {
  const plain = text.trim().replaceAll(",", "")
  const parsed = WHOLE.test(plain) ? parseDecimal(plain) : undefined
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

/** What of a row could not be read, whichever app wrote it. */
export type RowField = "date" | "outlay" | "takings" | "hours" | "gameKind" | "countedSpins" | "countedJackpots"

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
