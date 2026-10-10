const BYTE_ORDER_MARK = "﻿"

/** Where the reading of a CSV text stands: the rows read, the row and the cell being read, and whether the reading is inside quotes. */
interface Reading {
  readonly rows: readonly (readonly string[])[]
  readonly row: readonly string[]
  readonly cell: string
  readonly quoted: boolean
}

const BEGUN: Reading = { rows: [], row: [], cell: "", quoted: false }

const cellEnded = (reading: Reading): Reading => ({ ...reading, row: [...reading.row, reading.cell], cell: "" })

const rowEnded = (reading: Reading): Reading => ((ended) => ({ ...ended, rows: [...ended.rows, ended.row], row: [] }))(cellEnded(reading))

/** One character taken in, with the one after it: a doubled quote inside quotes is one quote, and is marked so its second half is passed over. */
const taken = (reading: Reading, character: string, next: string | undefined): Reading & { readonly skip?: true } => {
  if (reading.quoted) {
    if (character !== '"') return { ...reading, cell: reading.cell + character }
    return next === '"' ? { ...reading, cell: `${reading.cell}"`, skip: true } : { ...reading, quoted: false }
  }
  if (character === '"') return { ...reading, quoted: true }
  if (character === ",") return cellEnded(reading)
  if (character === "\n") return rowEnded(reading)
  return character === "\r" ? reading : { ...reading, cell: reading.cell + character }
}

/**
 * A CSV text as rows of cells, as RFC 4180 writes it: cells apart by
 * commas, rows by line breaks of either kind, a cell in quotes holding
 * commas, line breaks and doubled quotes. A byte order mark at the head is
 * not part of the first cell, and a row with nothing in it is no row.
 */
export const rowsOfCsv = (text: string): readonly (readonly string[])[] => {
  const characters = [...(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text)]
  const read = characters.reduce<{ readonly reading: Reading; readonly skipping: boolean }>(
    (state, character, index) => {
      if (state.skipping) return { reading: state.reading, skipping: false }
      const { skip, ...reading } = taken(state.reading, character, characters[index + 1])
      return { reading, skipping: skip === true }
    },
    { reading: BEGUN, skipping: false },
  ).reading
  const rows = read.cell === "" && read.row.length === 0 ? read.rows : rowEnded(read).rows
  return rows.filter((row) => row.some((cell) => cell.trim() !== ""))
}
