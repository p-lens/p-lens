import type { Transaction } from "../../hledger/protocol/wire"
import { TALLY_TAGS } from "../tally/tally"

/** The name a sender was last recorded under, and the day of that tally: what two books' names for one id are chosen between by. */
export interface LastNamed {
  readonly name: string
  readonly date: string
}

/** Each sender's last name, by the id their entries carry. */
export type SenderNames = ReadonlyMap<string, LastNamed>

const tagged = (transaction: Transaction, name: string): string | undefined => transaction.ttags.find(([tag]) => tag === name)?.[1].trim()

const later = (kept: LastNamed | undefined, found: LastNamed): LastNamed => (kept === undefined || found.date > kept.date ? found : kept)

/**
 * Who sent a book's plays, each by the name on their last tally: a name is
 * the owner's to change, and the id is what stays. The entries come newest
 * first, so the first of an id is its last, a later one on the same day
 * before an earlier.
 */
export const senderNamesOf = (newestFirst: readonly Transaction[]): SenderNames =>
  newestFirst.reduce<ReadonlyMap<string, LastNamed>>((names, transaction) => {
    const id = tagged(transaction, TALLY_TAGS.senderId)
    return id === undefined || id === "" || names.has(id) ? names : new Map([...names, [id, { name: tagged(transaction, TALLY_TAGS.sender) ?? "", date: transaction.tdate }]])
  }, new Map())

/** Several books' senders as one: where two say a name for one id, the later tally's. */
export const mergedSenderNames = (books: readonly SenderNames[]): SenderNames =>
  books.reduce<ReadonlyMap<string, LastNamed>>((all, book) => [...book].reduce((sofar, [id, named]) => new Map([...sofar, [id, later(sofar.get(id), named)]]), all), new Map())

/**
 * What a book's tallies that name no sender go by among who played them,
 * where a choice of them is written down: its owner's own, and plays taken
 * in before senders were written. No sender's id is ever this word.
 */
export const UNSENT = "unsent"
