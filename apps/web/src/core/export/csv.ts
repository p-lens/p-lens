/** The mark a spreadsheet takes a file as UTF-8 by; without it, one reads Japanese in the desk's own encoding and shows it garbled. */
const BYTE_ORDER_MARK = "﻿"

const cellOf = (text: string): string => (/[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text)

/** Rows of cells as CSV text, as RFC 4180 writes it: a cell holding a comma, a quote or a line break is quoted, and a line ends in CRLF. */
export const csvOf = (rows: readonly (readonly string[])[]): string => `${BYTE_ORDER_MARK}${rows.map((row) => `${row.map(cellOf).join(",")}\r\n`).join("")}`
