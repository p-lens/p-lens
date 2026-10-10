import { memberCan, type BookId, type MemberId } from "../core/book/book"
import { appendEntry, BOOK_FILES } from "../core/journal/layout"
import { renderEntry, type Entry } from "../core/journal/entry"
import { parlorsFromDeclarations, type Parlor } from "../core/parlor/parlor"
import { composePlayEntry, composeTalliedEntry } from "../core/play/compose"
import type { PlayError, PlayHead, PlayRecord, TalliedPlay } from "../core/play/play"
import { playLogPath } from "../core/play-log/checkpoint"
import { pricePointsOf } from "../core/report/holdings"
import { andThen, mapOk, type Result } from "../core/result/result"
import type { PricePoint } from "../core/valuation/valuation"
import { accountsRequest, pricesRequest } from "../hledger/query/requests"
import type { CommitId } from "../history/port/history-port"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromPlay } from "./lift"

/** What recording a play needs to know about the book before anything is typed. */
export interface RecordingContext {
  readonly parlors: readonly Parlor[]
  readonly prices: readonly PricePoint[]
  readonly canWrite: boolean
}

export const loadRecordingContext = (session: BookSession, bookId: BookId, member: MemberId): Promise<Outcome<RecordingContext>> =>
  session.read(bookId, async (journal, stored) => {
    const [accounts, prices] = await Promise.all([journal.ask(accountsRequest), journal.ask(pricesRequest(""))])
    return andThen(fromHledger(accounts), (declared) =>
      mapOk(fromHledger(prices), (directives) => ({
        parlors: parlorsFromDeclarations(declared),
        prices: pricePointsOf(directives),
        canWrite: memberCan(stored.book, member, "write"),
      })),
    )
  })

/** A play's entry as composed from the book's prices at the moment of writing. */
type Composer = (prices: readonly PricePoint[]) => Result<Entry, PlayError>

const writePlay = (session: BookSession, bookId: BookId, head: PlayHead, compose: Composer, log: string | undefined): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(pricesRequest(""))), (directives) =>
      mapOk(fromPlay(compose(pricePointsOf(directives))), (entry): ProposedChange => ({
        files: {
          ...stored.files,
          [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", renderEntry(entry)),
          ...(log === undefined ? {} : { [playLogPath(head.gameKind, head.id)]: log }),
        },
        intent: { type: "play-recorded", playId: head.id, description: entry.description, theoreticalValue: head.theoreticalValue },
      })),
    ),
  )

/**
 * Write one play into the book as one entry and one commit, with its play log
 * beside it when there is one. The rate a rental is split at is read from the
 * book as it is at the moment of writing, not from whatever a form was showing.
 */
export const recordPlay = (session: BookSession, bookId: BookId, record: PlayRecord, log?: string): Promise<Outcome<CommitId>> =>
  writePlay(session, bookId, record, (prices) => composePlayEntry(record, prices), log)

/** Write one play kept in yen alone into the book, as one entry and one commit, with its play log when there is one. */
export const recordTalliedPlay = (session: BookSession, bookId: BookId, play: TalliedPlay, log?: string): Promise<Outcome<CommitId>> =>
  writePlay(session, bookId, play, () => composeTalliedEntry(play), log)
