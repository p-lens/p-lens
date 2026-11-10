import type { RowsUnreadable } from "./cells"
import type { CsvProblem } from "./csv-rows"

/**
 * Why a file does not read, whichever app's it is: it holds no tallies,
 * some of its rows do not read, or it does not read as a CSV. Each app's
 * reading adds its own reasons beside these.
 */
export type ReadingProblem = { readonly type: "empty" } | RowsUnreadable | CsvProblem
