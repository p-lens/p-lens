/** The mark a spreadsheet takes a file as UTF-8 by; without it, one reads Japanese in the desk's own encoding and shows it garbled. */
const BYTE_ORDER_MARK = "﻿"

const cellOf = (text: string): string => (/[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text)

/** How a CSV's lines end: in CRLF, as RFC 4180 writes them, or in LF, as an app that writes its own that way takes them back. */
export type LineEnding = "\r\n" | "\n"

/** Rows of cells as CSV text with no byte order mark, as an app that writes its own in another encoding takes them back: a cell holding a comma, a quote or a line break is quoted. */
export const bareCsvOf = (rows: readonly (readonly string[])[], ending: LineEnding): string => rows.map((row) => `${row.map(cellOf).join(",")}${ending}`).join("")

/** Rows of cells as CSV text, as RFC 4180 writes it, with the byte order mark a spreadsheet reads UTF-8 by: a cell holding a comma, a quote or a line break is quoted, and a line ends in CRLF unless another ending is given. */
export const csvOf = (rows: readonly (readonly string[])[], ending: LineEnding = "\r\n"): string => `${BYTE_ORDER_MARK}${bareCsvOf(rows, ending)}`
