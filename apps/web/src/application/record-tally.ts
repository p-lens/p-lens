import { memberCan, type BookId, type MemberId } from "../core/book/book"
import type { KeptInferenceTerms } from "../core/book/settings"
import { appendEntry, BOOK_FILES } from "../core/journal/layout"
import { renderEntry, type Entry } from "../core/journal/entry"
import { parlorsFromDeclarations, type Parlor } from "../core/parlor/parlor"
import { composeTokenTallyEntry, composeYenTallyEntry, rateToWriteWith } from "../core/tally/compose"
import type { TallyError, TallyHead, TokenTally, YenTally } from "../core/tally/tally"
import { playLogPath } from "../core/play-log/checkpoint"
import { pricePointsOf } from "../core/report/holdings"
import { andThen, mapOk, type Result } from "../core/result/result"
import { withOffBookDeclaredFor } from "../core/savings/off-book"
import { withPrizesDeclaredFor } from "../core/savings/prize-exchange"
import { withPlayTimeDeclaredFor } from "../core/tally/play-time"
import { withInferredDeclaredFor } from "../core/theoretical/theoretical"
import { renderPricePoint, type PricePoint } from "../core/valuation/valuation"
import { accountsRequest, pricesRequest } from "../hledger/query/requests"
import type { CommitId } from "../history/port/history-port"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"
import { keptInferenceTermsOf } from "./inference-terms"
import { fromHledger, fromTally } from "./lift"

/** What recording a tally needs to know about the book before anything is typed. */
export interface RecordingContext {
  readonly parlors: readonly Parlor[]
  readonly prices: readonly PricePoint[]
  readonly canWrite: boolean
  /** The terms the book keeps for a tally typed in by hand of each game, which its form opens on. */
  readonly inferenceTerms: KeptInferenceTerms
}

export const loadRecordingContext = (session: BookSession, bookId: BookId, member: MemberId): Promise<Outcome<RecordingContext>> =>
  session.read(bookId, async (journal, stored) => {
    const [accounts, prices] = await Promise.all([journal.ask(accountsRequest), journal.ask(pricesRequest(""))])
    return andThen(fromHledger(accounts), (declared) =>
      mapOk(fromHledger(prices), (directives) => ({
        parlors: parlorsFromDeclarations(declared),
        prices: pricePointsOf(directives),
        canWrite: memberCan(stored.book, member, "write"),
        inferenceTerms: keptInferenceTermsOf(stored.files),
      })),
    )
  })

/** A tally's entry as composed from the book's prices at the moment of writing, and the rate to be written with it where the book has none for its day. */
export interface ComposedTally {
  readonly entry: Entry
  readonly price: PricePoint | undefined
}

export type Composer = (prices: readonly PricePoint[]) => Result<ComposedTally, TallyError>

/**
 * A tally in tokens composed on the book's rates: where the book has no rate
 * for the tally's day — a tally dated before its pool was opened — the pool's
 * first rate is taken for that day and written beside the entry, rather
 * than the tally refused for want of a rate the book can give itself.
 */
export const composedOnBookRates =
  (tally: TokenTally): Composer =>
  (prices) => {
    const price = rateToWriteWith(tally, prices)
    return mapOk(composeTokenTallyEntry(tally, price === undefined ? prices : [...prices, price]), (entry) => ({ entry, price }))
  }

/** A tally kept in yen alone composed: it has no tokens, so no rate is written with it. */
export const composedInYen =
  (tally: YenTally): Composer =>
  () =>
    mapOk(composeYenTallyEntry(tally), (entry) => ({ entry, price: undefined }))

/** The book's files with the accounts an entry posts to declared, where the book lacks them: a gain in yen is written to the prize accounts, a theoretical value nobody measured to an account of its own, and savings the book does not keep to theirs, and a play's time to its account in seconds, and a book made before any was has none. */
export const withAccountsFor = (files: ProposedChange["files"], entry: Entry): ProposedChange["files"] => {
  const accounts = files[BOOK_FILES.accounts] ?? ""
  const declared = withPlayTimeDeclaredFor(withOffBookDeclaredFor(withInferredDeclaredFor(withPrizesDeclaredFor(accounts, entry), entry), entry), entry)
  return declared === accounts ? files : { ...files, [BOOK_FILES.accounts]: declared }
}

/** The book's files with a rate added to its prices, where there is one to add. */
export const withPrice = (files: ProposedChange["files"], price: PricePoint | undefined): ProposedChange["files"] =>
  price === undefined ? files : { ...files, [BOOK_FILES.prices]: appendEntry(files[BOOK_FILES.prices] ?? "", renderPricePoint(price)) }

const writeTally = (session: BookSession, bookId: BookId, head: TallyHead, compose: Composer, log: string | undefined): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(pricesRequest(""))), (directives) =>
      mapOk(fromTally(compose(pricePointsOf(directives))), ({ entry, price }): ProposedChange => ({
        files: {
          ...withPrice(withAccountsFor(stored.files, entry), price),
          [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", renderEntry(entry)),
          ...(log === undefined ? {} : { [playLogPath(head.gameKind, head.id)]: log }),
        },
        intent: { type: "play-recorded", playId: head.id, description: entry.description, theoreticalValue: head.theoreticalValue },
      })),
    ),
  )

/**
 * Write one tally in tokens into the book as one entry and one commit, with its play's log
 * beside it when there is one. The rate a rental is split at is read from the
 * book as it is at the moment of writing, not from whatever a form was showing;
 * a day the book has no rate for is given the pool's first, in the same commit.
 */
export const recordTokenTally = (session: BookSession, bookId: BookId, tally: TokenTally, log?: string): Promise<Outcome<CommitId>> =>
  writeTally(session, bookId, tally, composedOnBookRates(tally), log)

/** Write one tally kept in yen alone into the book, as one entry and one commit, with its play's log when there is one. */
export const recordYenTally = (session: BookSession, bookId: BookId, tally: YenTally, log?: string): Promise<Outcome<CommitId>> =>
  writeTally(session, bookId, tally, composedInYen(tally), log)
