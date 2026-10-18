import type { BookId } from "../core/book/book"
import { appendEntry, BOOK_FILES } from "../core/journal/layout"
import { linkedFiles, linksFor } from "../core/parlor/linking"
import { checkOpening, openingText, parlorOpened, type OpeningText, type PoolOpening } from "../core/parlor/opening"
import { parlorsFromDeclarations, type Parlor } from "../core/parlor/parlor"
import type { SharedParlor } from "../core/parlor/shared"
import { pricePointsOf } from "../core/report/holdings"
import { Ok, andThen, mapOk } from "../core/result/result"
import type { PricePoint } from "../core/valuation/valuation"
import { accountsRequest, pricesRequest } from "../hledger/query/requests"
import type { JournalAccess } from "../hledger/client/client"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromOpening } from "./lift"

interface Kept {
  readonly parlors: readonly Parlor[]
  readonly prices: readonly PricePoint[]
}

const keptIn = async (journal: JournalAccess): Promise<Outcome<Kept>> => {
  const [accounts, prices] = await Promise.all([journal.ask(accountsRequest), journal.ask(pricesRequest(""))])
  return andThen(fromHledger(accounts), (declared) =>
    mapOk(fromHledger(prices), (directives) => ({ parlors: parlorsFromDeclarations(declared), prices: pricePointsOf(directives) })),
  )
}

const nothingToWrite = (text: OpeningText): boolean => text.declarations === undefined && text.price === undefined

/**
 * Make a book ready for a play at a parlor's pool, as one commit: the pool's
 * commodity and savings account in `accounts.journal` if the book does not
 * keep it yet, and the day's exchange rate in `prices.journal` if the rate in
 * force on the day is not already that. A book that has both is left alone.
 * Checked against the book as it is at the moment of writing.
 */
export const openPool = async (session: BookSession, bookId: BookId, opening: PoolOpening): Promise<Outcome<Parlor>> => {
  const before = await session.read(bookId, (journal) => keptIn(journal))
  if (!before.ok) return before
  const checked = fromOpening(checkOpening(opening, before.value.parlors))
  if (!checked.ok) return checked
  if (nothingToWrite(openingText(opening, before.value.parlors, before.value.prices))) return Ok(parlorOpened(opening, before.value.parlors))
  return mapOk(
    await session.write(bookId, async (journal, stored) =>
      andThen(await keptIn(journal), (kept) =>
        mapOk(fromOpening(checkOpening(opening, kept.parlors)), (valid) => {
          const text = openingText(valid, kept.parlors, kept.prices)
          return {
            files: {
              ...stored.files,
              ...(text.declarations === undefined ? {} : { [BOOK_FILES.accounts]: appendEntry(stored.files[BOOK_FILES.accounts] ?? "", text.declarations) }),
              ...(text.price === undefined ? {} : { [BOOK_FILES.prices]: appendEntry(stored.files[BOOK_FILES.prices] ?? "", text.price) }),
            },
            intent: { type: "pool-opened" as const, parlor: valid.parlorName, tier: valid.pool.tier, date: valid.date, rate: valid.rate },
          }
        }),
      ),
    ),
    () => parlorOpened(opening, before.value.parlors),
  )
}

/**
 * Link the book's parlors waiting on a submission that the list has now
 * taken, as one commit: the list's id written beside each submission, so the
 * book reads them as listed parlors from then on. How many were linked; none
 * leaves the book alone.
 */
export const linkSubmissions = async (session: BookSession, bookId: BookId, listed: readonly SharedParlor[]): Promise<Outcome<number>> => {
  const before = await session.read(bookId, (journal) => keptIn(journal))
  if (!before.ok) return before
  if (linksFor(before.value.parlors, listed).length === 0) return Ok(0)
  const linked = await session.write(bookId, async (journal, stored) =>
    mapOk(await keptIn(journal), (kept) => {
      const links = linksFor(kept.parlors, listed)
      return { files: linkedFiles(stored.files, links), intent: { type: "parlors-linked" as const, names: links.map((link) => link.name) } }
    }),
  )
  return mapOk(linked, () => linksFor(before.value.parlors, listed).length)
}

/** Link the waiting parlors of each of these books in turn, as `linkSubmissions` links one's: how many were linked in all. The first book that cannot be written stops it there. */
export const linkSubmissionsInBooks = (session: BookSession, bookIds: readonly BookId[], listed: readonly SharedParlor[]): Promise<Outcome<number>> =>
  bookIds.reduce<Promise<Outcome<number>>>(async (so, bookId) => {
    const count = await so
    return count.ok ? mapOk(await linkSubmissions(session, bookId, listed), (linked) => count.value + linked) : count
  }, Promise.resolve(Ok(0)))
