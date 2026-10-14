import type { BookId } from "../core/book/book"
import { mapOk } from "../core/result/result"
import { theoreticalKeptRequest } from "../hledger/query/requests"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger } from "./lift"

/**
 * Whether a book has a theoretical value written anywhere in it. A book
 * with none has not been keeping them, and a sum of theoretical values
 * over it is nothing to show: it would read as tallies worth nothing, which
 * is not what was said. hledger is asked for one entry on the account,
 * over the whole book and whatever period is on screen.
 */
export const keepsTheoreticalValues = (session: BookSession, bookId: BookId): Promise<Outcome<boolean>> =>
  session.read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(theoreticalKeptRequest)), (page) => page.total > 0))
