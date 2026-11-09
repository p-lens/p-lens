import { memberCan, type BookId, type MemberId } from "../core/book/book"
import type { Decimal } from "../core/decimal/decimal"
import { renderEntry } from "../core/journal/entry"
import { parlorsFromDeclarations, type Parlor } from "../core/parlor/parlor"
import { withoutTallyFiled, withTallyFiled } from "../core/journal/filing"
import type { TallyHead, TokenTally, YenTally } from "../core/tally/tally"
import type { PlayId } from "../core/play/play"
import { playLogPath } from "../core/play-log/checkpoint"
import { withParlorInHead } from "../core/play-log/head"
import { pricePointsOf } from "../core/report/holdings"
import { recordedTallyOf, type RecordedTally } from "../core/report/recorded-tally"
import { Err, Ok, andThen, mapOk } from "../core/result/result"
import { accountsRequest, talliesRequest, pricesRequest } from "../hledger/query/requests"
import { tallyTerm } from "../hledger/query/terms"
import type { CommitId } from "../history/port/history-port"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromTally } from "./lift"
import { keptInferenceTermsOf } from "./inference-terms"
import { openPool } from "./parlors"
import { composedInYen, composedOnBookRates, withAccountsFor, withPrice, type ComposedTally, type Composer, type RecordingContext } from "./record-tally"
import { askUserTags } from "./user-tags"

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
    const [accounts, prices, entries, userTags] = await Promise.all([journal.ask(accountsRequest), journal.ask(pricesRequest("")), journal.ask(talliesRequest(tallyTerm(id), { limit: 1, offset: 0 })), askUserTags(journal)])
    return andThen(fromHledger(accounts), (declared) =>
      andThen(fromHledger(prices), (directives) =>
        andThen(andThen(fromHledger(entries), (page) => mapOk(userTags, (tags) => ({ page, tags }))), ({ page, tags }): Outcome<Revising> => {
          const transaction = page.items[0]
          if (transaction === undefined) return Err({ type: "tally-missing" })
          const parlors = parlorsFromDeclarations(declared)
          const recorded = recordedTallyOf(transaction, parlors)
          return recorded === undefined ? Err({ type: "tally-unreadable" }) : Ok({ context: { parlors, prices: pricePointsOf(directives), canWrite: memberCan(stored.book, member, "write"), inferenceTerms: keptInferenceTermsOf(stored.files), userTags: tags }, recorded })
        }),
      ),
    )
  })

/** The log a revised tally leaves beside it: the one given, or the one it has with its head saying the tally's parlor; none where it has none. */
const logAfter = (files: ProposedChange["files"], head: TallyHead, parlor: Parlor | undefined, given: string | undefined): string | undefined => {
  if (given !== undefined) return given
  const kept = files[playLogPath(head.gameKind, head.id)]
  return kept === undefined ? undefined : withParlorInHead(kept, parlor === undefined ? undefined : { name: parlor.name, identity: parlor.identity })
}

/** The book's files with a tally's entry put in place of the one it has, if it has one, and the rate its day lacked beside it. */
const revised = (files: ProposedChange["files"], head: TallyHead, parlor: Parlor | undefined, { entry, price }: ComposedTally, given: string | undefined): Outcome<ProposedChange> => {
  const filed = withTallyFiled(withPrice(withAccountsFor(files, entry), price), head.id, entry.date, renderEntry(entry))
  const log = logAfter(files, head, parlor, given)
  return filed === undefined
    ? Err({ type: "tally-missing" })
    : Ok({ files: { ...filed, ...(log === undefined ? {} : { [playLogPath(head.gameKind, head.id)]: log }) }, intent: { type: "play-revised", playId: head.id, description: entry.description, theoreticalValue: head.theoreticalValue } })
}

const revise = (session: BookSession, bookId: BookId, head: TallyHead, parlor: Parlor | undefined, compose: Composer, log: string | undefined): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(pricesRequest(""))), (directives) => andThen(fromTally(compose(pricePointsOf(directives))), (composed) => revised(stored.files, head, parlor, composed, log))),
  )

/**
 * Set a recorded tally right: its entry written anew where it stands, as
 * one commit. A rental is split at the book's rate for the day the tally now
 * says, as it is when a tally is recorded, and a day moved to before any rate
 * the book has is given the pool's first. Its log is left as it is unless
 * one is given: a play recorded again from its readings, set right since,
 * brings them, and they take the place of those the book has.
 */
export const reviseTokenTally = (session: BookSession, bookId: BookId, tally: TokenTally, log?: string): Promise<Outcome<CommitId>> => revise(session, bookId, tally, tally.parlor, composedOnBookRates(tally), log)

/**
 * Set a recorded tally right at the parlor it was played at, where it was
 * recorded at another: the pool it draws on is opened there, at the rate it
 * was counted at where that parlor has none for its day, and its entry written
 * anew, so that its savings and everything else it moved go with it. The tally
 * says the parlor it moves to; what it was recorded at keeps what it held
 * otherwise.
 */
export const moveTokenTally = async (session: BookSession, bookId: BookId, tally: TokenTally, rate: Decimal): Promise<Outcome<CommitId>> => {
  const opened = await openPool(session, bookId, { identity: tally.parlor.identity, parlorName: tally.parlor.name, pool: tally.pool, rate, date: tally.date })
  return opened.ok ? reviseTokenTally(session, bookId, { ...tally, parlor: opened.value }) : opened
}

/** Set right a tally kept in yen alone: its entry written anew where it stands, as one commit, its log replaced where one is given. */
export const reviseYenTally = (session: BookSession, bookId: BookId, tally: YenTally, log?: string): Promise<Outcome<CommitId>> => revise(session, bookId, tally, tally.parlor, composedInYen(tally), log)

/**
 * Take a recorded tally out of a book, as one commit: its entry leaves the
 * journal, and with it everything the tally moved. Its log, where it has
 * one, stays among the book's files — what was read at the cabinet is not
 * unread — and the history keeps the entry that was there.
 */
export const removeTally = (session: BookSession, bookId: BookId, id: PlayId): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(talliesRequest(tallyTerm(id), { limit: 1, offset: 0 }))), (page): Outcome<ProposedChange> => {
      const files = withoutTallyFiled(stored.files, id)
      const transaction = page.items[0]
      return files === undefined || transaction === undefined
        ? Err({ type: "tally-missing" })
        : Ok({ files, intent: { type: "play-removed", playId: id, description: transaction.tdescription } })
    }),
  )
