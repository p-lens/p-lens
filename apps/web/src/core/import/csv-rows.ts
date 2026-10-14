import { Err, Ok, type Result } from "../result/result"

const BYTE_ORDER_MARK = "\uFEFF"

/** Where a CSV text stops reading as RFC 4180 writes it, by the line it is on: a quote inside a cell not begun with one, or after a quoted cell's end, or one never closed. */
export interface CsvProblem {
  readonly type: "stray-quote" | "unclosed-quote"
  readonly line: number
}

/** Where the reading of a CSV text stands: the rows read, the row and the cell being read, whether the reading is inside quotes or just past a quoted cell, and the line it is on. */
interface Reading {
  readonly rows: readonly (readonly string[])[]
  readonly row: readonly string[]
  readonly cell: string
  readonly quoted: boolean
  readonly closed: boolean
  readonly line: number
}

const BEGUN: Reading = { rows: [], row: [], cell: "", quoted: false, closed: false, line: 1 }

const cellEnded = (reading: Reading): Reading => ({ ...reading, row: [...reading.row, reading.cell], cell: "", closed: false })

const rowEnded = (reading: Reading): Reading => ((ended) => ({ ...ended, rows: [...ended.rows, ended.row], row: [] }))(cellEnded(reading))

const lineOf = (reading: Reading, character: string): number => (character === "\n" ? reading.line + 1 : reading.line)

/** One character taken in, with the one after it: a doubled quote inside quotes is one quote, and is marked so its second half is passed over. */
const taken = (reading: Reading, character: string, next: string | undefined): Result<Reading & { readonly skip?: true }, CsvProblem> => {
  if (reading.quoted) {
    if (character !== '"') return Ok({ ...reading, cell: reading.cell + character, line: lineOf(reading, character) })
    return Ok(next === '"' ? { ...reading, cell: `${reading.cell}"`, skip: true } : { ...reading, quoted: false, closed: true })
  }
  if (character === ",") return Ok(cellEnded(reading))
  if (character === "\n") return Ok({ ...rowEnded(reading), line: reading.line + 1 })
  if (character === "\r") return Ok(reading)
  if (reading.closed) return Err({ type: "stray-quote", line: reading.line })
  if (character === '"') return reading.cell === "" ? Ok({ ...reading, quoted: true }) : Err({ type: "stray-quote", line: reading.line })
  return Ok({ ...reading, cell: reading.cell + character })
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
  const characters = [...(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text)]
  const read = characters.reduce<Result<{ readonly reading: Reading; readonly skipping: boolean }, CsvProblem>>((state, character, index) => {
    if (!state.ok) return state
    if (state.value.skipping) return Ok({ reading: state.value.reading, skipping: false })
    const next = taken(state.value.reading, character, characters[index + 1])
    if (!next.ok) return next
    const { skip, ...reading } = next.value
    return Ok({ reading, skipping: skip === true })
  }, Ok({ reading: BEGUN, skipping: false }))
  if (!read.ok) return read
  const { reading } = read.value
  if (reading.quoted) return Err({ type: "unclosed-quote", line: reading.line })
  const rows = reading.cell === "" && reading.row.length === 0 && !reading.closed ? reading.rows : rowEnded(reading).rows
  return Ok(rows.filter((row) => row.some((cell) => cell.trim() !== "")))
}
