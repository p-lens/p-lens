import type { Transaction } from "../../hledger/protocol/wire"
import { identityIn, sameIdentity, type Parlor } from "../parlor/parlor"
import { TALLY_TAGS } from "../tally/tally"
import { statisticsStand, unreadableTagsOf } from "./recorded-tally"

/**
 * What is wrong with a tally's entry in a way the app would read past:
 * a tag a form writes that does not read, a play's id left empty or given
 * to two entries, a parlor the book keeps no savings for, or a statistic
 * in something other than yen. Each would leave the tally out of a list
 * or a sum, or show it as something it is not, without a word.
 */
export type TallyProblem =
  | { readonly type: "tag-unreadable"; readonly playId: string; readonly tag: string }
  | { readonly type: "play-id-empty"; readonly date: string; readonly description: string }
  | { readonly type: "play-id-twice"; readonly playId: string }
  | { readonly type: "parlor-unknown"; readonly playId: string }
  | { readonly type: "statistic-not-yen"; readonly playId: string }

const playIdOf = (transaction: Transaction): string | undefined => transaction.ttags.find(([name]) => name === TALLY_TAGS.playId)?.[1].trim()

const problemsOfEntry = (transaction: Transaction, parlors: readonly Parlor[]): readonly TallyProblem[] => {
  const playId = playIdOf(transaction)
  if (playId === undefined) return []
  if (playId === "") return [{ type: "play-id-empty", date: transaction.tdate, description: transaction.tdescription }]
  const identity = identityIn(transaction.ttags)
  return [
    ...unreadableTagsOf(transaction).map((tag): TallyProblem => ({ type: "tag-unreadable", playId, tag })),
    ...(identity === undefined || parlors.some((parlor) => sameIdentity(parlor.identity, identity)) ? [] : [{ type: "parlor-unknown", playId } as const]),
    ...(statisticsStand(transaction) ? [] : [{ type: "statistic-not-yen", playId } as const]),
  ]
}

const twice = (transactions: readonly Transaction[]): readonly TallyProblem[] => {
  const ids = transactions.flatMap((transaction) => ((id) => (id === undefined || id === "" ? [] : [id]))(playIdOf(transaction)))
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].map((playId) => ({ type: "play-id-twice", playId }))
}

/** What is wrong with the tallies' entries of a book, as hledger reads them, with the parlors it keeps savings for. */
export const tallyProblemsOf = (transactions: readonly Transaction[], parlors: readonly Parlor[]): readonly TallyProblem[] => [
  ...transactions.flatMap((transaction) => problemsOfEntry(transaction, parlors)),
  ...twice(transactions),
]

const keyOf = (problem: TallyProblem): string => JSON.stringify(problem)

/** The problems an edit brought in: those after it that were not there before it. */
export const tallyProblemsBroughtIn = (before: readonly TallyProblem[], after: readonly TallyProblem[]): readonly TallyProblem[] =>
  ((held) => after.filter((problem) => !held.has(keyOf(problem))))(new Set(before.map(keyOf)))
