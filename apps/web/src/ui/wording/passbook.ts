import { shownNameOf, type MachineNames } from "../../core/catalog/catalog"
import type { PassbookCause } from "../../core/report/passbook"
import { NO_MACHINE, shownDescription } from "./tallies"

/** What moved a pool's savings, as a line of its passbook says it: a tally by its machine, an entry about savings by what it was, one written by hand by its description. */
export const passbookCauseText = (cause: PassbookCause, names: MachineNames): string => {
  switch (cause.type) {
    case "tally":
      return cause.machine === undefined ? NO_MACHINE : shownNameOf(names, cause.machine)
    case "opening":
      return "開始残高"
    case "adjustment":
      return "残高調整"
    case "prize-exchange":
      return "交換払出"
    case "forfeiture":
      return "失効"
    case "other":
      return shownDescription(cause.description) || "手入力の仕訳"
  }
}

/** Beside a parlor several books keep savings at, how many: what is shown of it is theirs added. */
export const booksKeptText = (books: number): string => `(${String(books)}冊分)`

/** The rates a pool across books was valued at: one, or the lowest to the highest where the books value it differently. */
export const ratesText = (rates: readonly string[]): string => (rates.length === 0 ? "交換率なし" : rates.length === 1 ? `@ ${rates[0] ?? ""}` : `@ ${rates[0] ?? ""}〜${rates.at(-1) ?? ""}`)
