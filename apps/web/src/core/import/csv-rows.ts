import { Err, Ok, type Result } from "../result/result"

const BYTE_ORDER_MARK = "\uFEFF"

/** Where a CSV text stops reading as RFC 4180 writes it, by the line it is on: a quote inside a cell not begun with one, or after a quoted cell's end, or one never closed. */
export interface CsvProblem {
  readonly type: "stray-quote" | "unclosed-quote"
  readonly line: number
}

/**
 * Where the reading of a CSV text stands, as it goes: the rows read, the
 * row and the cell being read, whether the reading is inside quotes or
 * just past a quoted cell, and the line it is on. It lives only while one
 * text is read, so that each character costs the same however many rows
 * came before it.
 */
interface Reading {
  readonly rows: string[][]
  row: string[]
  cell: string
  quoted: boolean
  closed: boolean
  line: number
}

const cellEnded = (reading: Reading): void => {
  reading.row.push(reading.cell)
  reading.cell = ""
  reading.closed = false
}

const rowEnded = (reading: Reading): void => {
  cellEnded(reading)
  reading.rows.push(reading.row)
  reading.row = []
}

/** One character taken in outside quotes; a problem where it cannot stand there. */
const takenBare = (reading: Reading, character: string): CsvProblem | undefined => {
  if (character === ",") {
    cellEnded(reading)
    return undefined
  }
  if (character === "\n") {
    rowEnded(reading)
    reading.line += 1
    return undefined
  }
  if (character === "\r") return undefined
  if (reading.closed || (character === '"' && reading.cell !== "")) return { type: "stray-quote", line: reading.line }
  if (character === '"') reading.quoted = true
  else reading.cell += character
  return undefined
}

/**
 * A CSV text as rows of cells, as RFC 4180 writes it: cells apart by
 * commas, rows by line breaks of either kind, a cell in quotes holding
 * commas, line breaks and doubled quotes. A byte order mark at the head is
 * not part of the first cell, and a row with nothing in it is no row. A
 * quote anywhere else, or one never closed, makes it no CSV this reads:
 * every cell after it would be read into the wrong place.
 */
export const rowsOfCsv = (text: string): Result<readonly (readonly string[])[], CsvProblem> => {
  const body = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text
  const reading: Reading = { rows: [], row: [], cell: "", quoted: false, closed: false, line: 1 }
  for (let at = 0; at < body.length; at += 1) {
    const character = body.charAt(at)
    if (!reading.quoted) {
      const problem = takenBare(reading, character)
      if (problem !== undefined) return Err(problem)
    } else if (character !== '"') {
      reading.cell += character
      if (character === "\n") reading.line += 1
    } else if (body.charAt(at + 1) === '"') {
      reading.cell += '"'
      at += 1
    } else {
      reading.quoted = false
      reading.closed = true
    }
  }
  if (reading.quoted) return Err({ type: "unclosed-quote", line: reading.line })
  if (reading.cell !== "" || reading.row.length > 0 || reading.closed) rowEnded(reading)
  return Ok(reading.rows.filter((row) => row.some((cell) => cell.trim() !== "")))
}
