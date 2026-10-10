/**
 * Where each kind of thing is written in a book.
 *
 * `main.journal` is the entry hledger is pointed at and includes the rest by
 * name, never by pattern, so a file hledger finds missing has a name it can be
 * fetched by. Prices have a file of their own because they only accumulate.
 */
export const BOOK_FILES = {
  main: "main.journal",
  accounts: "accounts.journal",
  prices: "prices.journal",
  transactions: "transactions.journal",
} as const

export const ENTRY_FILE = BOOK_FILES.main

/** The paths a book is made of, as hledger and storage name them. */
export type BookFiles = Readonly<Record<string, string>>

/**
 * Append an entry to a file's text, separated from what is there by one blank
 * line however the file happened to end.
 */
export const appendEntry = (text: string, entry: string): string =>
  text.trim() === "" ? entry : `${text.replace(/\n*$/, "")}\n\n${entry}`

const BOOK_ORDER: readonly string[] = [BOOK_FILES.main, BOOK_FILES.accounts, BOOK_FILES.prices, BOOK_FILES.transactions]

/** A book's paths as a person reads them: the four journal files in the order main includes them, then the rest by path. */
export const inBookOrder = (paths: readonly string[]): readonly string[] => {
  const rank = (path: string): number => {
    const index = BOOK_ORDER.indexOf(path)
    return index === -1 ? BOOK_ORDER.length : index
  }
  return paths.toSorted((left, right) => rank(left) - rank(right) || left.localeCompare(right))
}
