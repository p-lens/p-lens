import { memberCan, type BookId, type MemberId } from "../core/book/book"
import { unfiledYears, withYearFiled } from "../core/journal/filing"
import { Err, Ok, andThen, mapOk } from "../core/result/result"
import type { JournalAccess } from "../hledger/client/client"
import { everyBalanceRequest, everyEntryRequest } from "../hledger/query/requests"
import type { HistoryPort } from "../history/port/history-port"
import type { LinkStore } from "../sync/port/link-store"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHistory, fromHledger } from "./lift"

/** Everything filing a book by year reaches: the book, its history, whether it is synced, and who files it. */
export interface FilingPorts {
  readonly session: BookSession
  readonly history: HistoryPort
  readonly links: LinkStore
  readonly member: MemberId
}

/** What hledger reads a book as, entry by entry and account by account: what filing it by year must leave as it was. */
const readingOf = async (journal: JournalAccess): Promise<Outcome<string>> => {
  const [entries, balances] = await Promise.all([journal.ask(everyEntryRequest), journal.ask(everyBalanceRequest)])
  return andThen(fromHledger(entries), (page) => mapOk(fromHledger(balances), (report) => JSON.stringify([page, report])))
}

/**
 * Whether a book may be filed by year here, now: this member may write it,
 * and, where it is synced, every commit of it is on its line, so that what
 * is moved is what every device already has and two devices filing it make
 * the same commits.
 */
const mayFile = async (ports: FilingPorts, bookId: BookId): Promise<Outcome<boolean>> => {
  const stored = await ports.session.stored(bookId)
  if (!stored.ok) return stored
  if (!memberCan(stored.value.book, ports.member, "write")) return Ok(false)
  const link = await ports.links.read(bookId)
  if (!link.ok) return Ok(false)
  if (link.value === undefined) return Ok(true)
  return mapOk(fromHistory(await ports.history.unsent(bookId)), (unsent) => unsent.length === 0)
}

/**
 * How many entries one commit moves into their year's file. A commit is
 * sent to the relay sealed whole, and a box may hold 2,000,000 characters
 * (`RELAY_LIMITS.boxLength`); an entry moved comes to about 4,200 of them —
 * its lines taken out and put in, in the journals and again in the
 * activity — measured on a sample book's year of 550 plays, which came to
 * 2.3 million. Two hundred keeps a commit under half the box.
 */
const FILED_AT_MOST = 200

/**
 * Some of a year's entries moved into its file, as one commit, kept only
 * where hledger reads the book after it as it read before the filing
 * began: a move changes nothing hledger reads, so every commit of it is
 * held to the one reading, and a book written meanwhile by anything else
 * is not filed further.
 */
const fileSome = (session: BookSession, bookId: BookId, year: string, reading: string): Promise<Outcome<unknown>> =>
  session.write(bookId, async (_journal, stored) => {
    const filed = withYearFiled(stored.files, year, FILED_AT_MOST)
    if (filed === undefined) return Err({ type: "filing-differs", year })
    return Ok({
      files: filed.files,
      intent: { type: "year-filed", year: Number(year), count: filed.count },
      accept: async (after: JournalAccess) => andThen(await readingOf(after), (now) => (now === reading ? Ok(undefined) : Err({ type: "filing-differs", year }))),
    })
  })

/** A year's entries all moved into its file, so many a commit, until none of that year is left unfiled. */
const fileYear = async (session: BookSession, bookId: BookId, year: string, reading: string): Promise<Outcome<void>> => {
  const stored = await session.stored(bookId)
  if (!stored.ok) return stored
  if (!unfiledYears(stored.value.files).includes(year)) return Ok(undefined)
  const filed = await fileSome(session, bookId, year, reading)
  return filed.ok ? fileYear(session, bookId, year, reading) : filed
}

/**
 * A book filed by year: each year's entries among its transactions not
 * filed by year moved into that year's file, written as they were, the
 * oldest year first and at most so many entries a commit, which the
 * activity tells. A move is kept only where hledger reads the book after
 * it, entry for entry and account for account, as it did before the filing
 * began; one that would read otherwise is not made, nor any after it. A
 * book whose transactions hold anything the app does not write is left as
 * it is, and so is one this member may not write, or one synced and
 * holding commits not yet on its line. The years moved, oldest first.
 */
export const fileByYear = async (ports: FilingPorts, bookId: BookId): Promise<Outcome<readonly string[]>> => {
  const may = await mayFile(ports, bookId)
  if (!may.ok || !may.value) return mapOk(may, () => [])
  const stored = await ports.session.stored(bookId)
  if (!stored.ok) return stored
  const years = unfiledYears(stored.value.files)
  if (years.length === 0) return Ok([])
  const reading = await ports.session.read(bookId, (journal) => readingOf(journal))
  if (!reading.ok) return reading
  return years.reduce<Promise<Outcome<readonly string[]>>>(
    async (before, year) => {
      const done = await before
      if (!done.ok) return done
      return mapOk(await fileYear(ports.session, bookId, year, reading.value), () => [...done.value, year])
    },
    Promise.resolve(Ok([])),
  )
}

/**
 * Every book on the device filed by year that may be, one after another:
 * a book that cannot be is passed over and the next filed all the same.
 * How many years were moved in all.
 */
export const fileEveryBookByYear = async (ports: FilingPorts): Promise<Outcome<number>> => {
  const books = await ports.session.books()
  if (!books.ok) return books
  return books.value.reduce<Promise<Outcome<number>>>(
    async (before, book) => {
      const counted = await before
      if (!counted.ok) return counted
      const filed = await fileByYear(ports, book.id)
      return Ok(counted.value + (filed.ok ? filed.value.length : 0))
    },
    Promise.resolve(Ok(0)),
  )
}
