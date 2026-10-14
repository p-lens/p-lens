import { memberCan, type BookId, type MemberId } from "../core/book/book"
import { renderEntry } from "../core/journal/entry"
import { BOOK_FILES } from "../core/journal/layout"
import { parlorsFromDeclarations } from "../core/parlor/parlor"
import { withoutTallyEntry, withTallyEntry } from "../core/tally/in-journal"
import type { TallyHead, TokenTally, YenTally } from "../core/tally/tally"
import type { PlayId } from "../core/play/play"
import { playLogPath } from "../core/play-log/checkpoint"
import { pricePointsOf } from "../core/report/holdings"
import { recordedTallyOf, type RecordedTally } from "../core/report/recorded-tally"
import { Err, Ok, andThen } from "../core/result/result"
import { accountsRequest, talliesRequest, pricesRequest } from "../hledger/query/requests"
import { tallyTerm } from "../hledger/query/terms"
import type { CommitId } from "../history/port/history-port"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromTally } from "./lift"
import { composedInYen, composedOnBookRates, withAccountsFor, withPrice, type ComposedTally, type Composer, type RecordingContext } from "./record-tally"

/** A recorded tally as it is set right: what the book knows before anything is typed, and the tally read back from its entry. */
export interface Revising {
  readonly context: RecordingContext
  readonly recorded: RecordedTally
}

/**
 * A tally of a book, read back from its entry into what it was recorded
 * from. A tally whose entry no form wrote is refused as unreadable: it is
 * set right in the book's own file.
 */
export const loadRecordedTally = (session: BookSession, bookId: BookId, member: MemberId, id: PlayId): Promise<Outcome<Revising>> =>
  session.read(bookId, async (journal, stored) => {
    const [accounts, prices, entries] = await Promise.all([journal.ask(accountsRequest), journal.ask(pricesRequest("")), journal.ask(talliesRequest(tallyTerm(id), { limit: 1, offset: 0 }))])
    return andThen(fromHledger(accounts), (declared) =>
      andThen(fromHledger(prices), (directives) =>
        andThen(fromHledger(entries), (page): Outcome<Revising> => {
          const transaction = page.items[0]
          if (transaction === undefined) return Err({ type: "tally-missing" })
          const parlors = parlorsFromDeclarations(declared)
          const recorded = recordedTallyOf(transaction, parlors)
          return recorded === undefined ? Err({ type: "tally-unreadable" }) : Ok({ context: { parlors, prices: pricePointsOf(directives), canWrite: memberCan(stored.book, member, "write") }, recorded })
        }),
      ),
    )
  })

/** The book's files with a tally's entry put in place of the one it has, if it has one, and the rate its day lacked beside it. */
const revised = (files: ProposedChange["files"], head: TallyHead, { entry, price }: ComposedTally, log: string | undefined): Outcome<ProposedChange> => {
  const transactions = withTallyEntry(files[BOOK_FILES.transactions] ?? "", head.id, renderEntry(entry))
  return transactions === undefined
    ? Err({ type: "tally-missing" })
    : Ok({ files: { ...withPrice(withAccountsFor(files, entry), price), [BOOK_FILES.transactions]: transactions, ...(log === undefined ? {} : { [playLogPath(head.gameKind, head.id)]: log }) }, intent: { type: "play-revised", playId: head.id, description: entry.description, theoreticalValue: head.theoreticalValue } })
}

const revise = (session: BookSession, bookId: BookId, head: TallyHead, compose: Composer, log: string | undefined): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(pricesRequest(""))), (directives) => andThen(fromTally(compose(pricePointsOf(directives))), (composed) => revised(stored.files, head, composed, log))),
  )

/**
 * Set a recorded tally right: its entry written anew where it stands, as
 * one commit. A rental is split at the book's rate for the day the tally now
 * says, as it is when a tally is recorded, and a day moved to before any rate
 * the book has is given the pool's first. Its log is left as it is unless
 * one is given: a play recorded again from its readings, set right since,
 * brings them, and they take the place of those the book has.
 */
export const reviseTokenTally = (session: BookSession, bookId: BookId, tally: TokenTally, log?: string): Promise<Outcome<CommitId>> => revise(session, bookId, tally, composedOnBookRates(tally), log)

/** Set right a tally kept in yen alone: its entry written anew where it stands, as one commit, its log replaced where one is given. */
export const reviseYenTally = (session: BookSession, bookId: BookId, tally: YenTally, log?: string): Promise<Outcome<CommitId>> => revise(session, bookId, tally, composedInYen(tally), log)

/**
 * Take a recorded tally out of a book, as one commit: its entry leaves the
 * journal, and with it everything the tally moved. Its log, where it has
 * one, stays among the book's files — what was read at the cabinet is not
 * unread — and the history keeps the entry that was there.
 */
export const removeTally = (session: BookSession, bookId: BookId, id: PlayId): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(talliesRequest(tallyTerm(id), { limit: 1, offset: 0 }))), (page): Outcome<ProposedChange> => {
      const transactions = withoutTallyEntry(stored.files[BOOK_FILES.transactions] ?? "", id)
      const transaction = page.items[0]
      return transactions === undefined || transaction === undefined
        ? Err({ type: "tally-missing" })
        : Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: transactions }, intent: { type: "play-removed", playId: id, description: transaction.tdescription } })
    }),
  )
