import { memberCan, type BookId, type MemberId } from "../core/book/book"
import { renderEntry } from "../core/journal/entry"
import { BOOK_FILES } from "../core/journal/layout"
import { parlorsFromDeclarations } from "../core/parlor/parlor"
import { withoutPlayEntry, withPlayEntry } from "../core/play/in-journal"
import type { PlayHead, PlayId, PlayRecord, TalliedPlay } from "../core/play/play"
import { playLogPath } from "../core/play-log/checkpoint"
import { pricePointsOf } from "../core/report/holdings"
import { recordedPlayOf, type RecordedPlay } from "../core/report/recorded-play"
import { Err, Ok, andThen } from "../core/result/result"
import { accountsRequest, playsRequest, pricesRequest } from "../hledger/query/requests"
import { playTerm } from "../hledger/query/terms"
import type { CommitId } from "../history/port/history-port"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromPlay } from "./lift"
import { composedInYen, composedOnBookRates, withPrice, type ComposedPlay, type Composer, type RecordingContext } from "./record-play"

/** A recorded play as it is set right: what the book knows before anything is typed, and the play read back from its entry. */
export interface Revising {
  readonly context: RecordingContext
  readonly recorded: RecordedPlay
}

/**
 * A play of a book, read back from its entry into what it was recorded
 * from. A play whose entry no form wrote is refused as unreadable: it is
 * set right in the book's own file.
 */
export const loadRecordedPlay = (session: BookSession, bookId: BookId, member: MemberId, id: PlayId): Promise<Outcome<Revising>> =>
  session.read(bookId, async (journal, stored) => {
    const [accounts, prices, entries] = await Promise.all([journal.ask(accountsRequest), journal.ask(pricesRequest("")), journal.ask(playsRequest(playTerm(id), { limit: 1, offset: 0 }))])
    return andThen(fromHledger(accounts), (declared) =>
      andThen(fromHledger(prices), (directives) =>
        andThen(fromHledger(entries), (page): Outcome<Revising> => {
          const transaction = page.items[0]
          if (transaction === undefined) return Err({ type: "play-missing" })
          const parlors = parlorsFromDeclarations(declared)
          const recorded = recordedPlayOf(transaction, parlors)
          return recorded === undefined ? Err({ type: "play-unreadable" }) : Ok({ context: { parlors, prices: pricePointsOf(directives), canWrite: memberCan(stored.book, member, "write") }, recorded })
        }),
      ),
    )
  })

/** The book's files with a play's entry put in place of the one it has, if it has one, and the rate its day lacked beside it. */
const revised = (files: ProposedChange["files"], head: PlayHead, { entry, price }: ComposedPlay, log: string | undefined): Outcome<ProposedChange> => {
  const transactions = withPlayEntry(files[BOOK_FILES.transactions] ?? "", head.id, renderEntry(entry))
  return transactions === undefined
    ? Err({ type: "play-missing" })
    : Ok({ files: { ...withPrice(files, price), [BOOK_FILES.transactions]: transactions, ...(log === undefined ? {} : { [playLogPath(head.gameKind, head.id)]: log }) }, intent: { type: "play-revised", playId: head.id, description: entry.description, theoreticalValue: head.theoreticalValue } })
}

const revise = (session: BookSession, bookId: BookId, head: PlayHead, compose: Composer, log: string | undefined): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(pricesRequest(""))), (directives) => andThen(fromPlay(compose(pricePointsOf(directives))), (composed) => revised(stored.files, head, composed, log))),
  )

/**
 * Set a recorded play right: its entry written anew where it stands, as
 * one commit. A rental is split at the book's rate for the day the play now
 * says, as it is when a play is recorded, and a day moved to before any rate
 * the book has is given the pool's first. Its log is left as it is unless
 * one is given: a play recorded again from its readings, set right since,
 * brings them, and they take the place of those the book has.
 */
export const revisePlay = (session: BookSession, bookId: BookId, record: PlayRecord, log?: string): Promise<Outcome<CommitId>> => revise(session, bookId, record, composedOnBookRates(record), log)

/** Set right a play kept in yen alone: its entry written anew where it stands, as one commit, its log replaced where one is given. */
export const reviseTalliedPlay = (session: BookSession, bookId: BookId, play: TalliedPlay, log?: string): Promise<Outcome<CommitId>> => revise(session, bookId, play, composedInYen(play), log)

/**
 * Take a recorded play out of a book, as one commit: its entry leaves the
 * journal, and with it everything the play moved. Its log, where it has
 * one, stays among the book's files — what was read at the cabinet is not
 * unread — and the history keeps the entry that was there.
 */
export const removePlay = (session: BookSession, bookId: BookId, id: PlayId): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(playsRequest(playTerm(id), { limit: 1, offset: 0 }))), (page): Outcome<ProposedChange> => {
      const transactions = withoutPlayEntry(stored.files[BOOK_FILES.transactions] ?? "", id)
      const transaction = page.items[0]
      return transactions === undefined || transaction === undefined
        ? Err({ type: "play-missing" })
        : Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: transactions }, intent: { type: "play-removed", playId: id, description: transaction.tdescription } })
    }),
  )
