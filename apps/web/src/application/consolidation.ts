import type { BookId, ListedBook } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import { ZERO } from "../core/decimal/decimal"
import type { Dimension, Group, OVERALL } from "../core/report/breakdown"
import type { Holdings } from "../core/report/holdings"
import type { OtherGains } from "../core/report/other-gains"
import type { Overall } from "../core/report/overall"
import { mergedSenderNames, type SenderNames } from "../core/report/senders"
import { mergedSpinPerformances, type SpinPerformancesByMachine } from "../core/report/spin-performance"
import { Ok, mapOk } from "../core/result/result"
import { combine, talliesTerm } from "../hledger/query/terms"
import type { JournalsDigest, Summaries } from "../consolidation/port/summaries"
import { daysOfQuery } from "../core/journal/views"
import { lastRateDayOf } from "../core/valuation/rates-day"
import type { BookSession } from "./book-session"
import { loadBreakdown, loadDaysAndWhole, loadSenderBreakdown, loadSenderNames, loadSpinPerformances, type DaysAndWhole } from "./breakdown"
import type { Outcome } from "./errors"
import { loadHoldings } from "./holdings"
import { loadOtherGains } from "./other-gains"
import { loadOverall } from "./overall"
import { loadOverview } from "./overview"
import { keepsTheoreticalValues } from "./theoretical"

/** What several books' results are grouped by: what one book's are, the books themselves, or who played them — or the books taken as one. */
export type ConsolidatedBy = typeof OVERALL | Dimension | "book" | "sender"

/** What several books' results are grouped by, where they are grouped at all. */
export type ConsolidatedGrouping = Exclude<ConsolidatedBy, typeof OVERALL>

/** One book among those consolidated: which, and what was asked of it — or why it could not be read. */
export interface ConsolidatedBook<T> {
  readonly book: ListedBook
  readonly read: Outcome<T>
}

/**
 * Everything a consolidation reaches: the books; what it keeps of each
 * book's answers, and the digest of a book's journals it keeps them under;
 * the business day, a report of an open period ending on it; when a book
 * answered at once is read after, once what it answered is shown; and whom
 * to tell when an answer it gave turns out to be of a book since written. One
 * book's own screens reach the books alone, as they always have.
 */
export interface ConsolidationParts {
  readonly session: BookSession
  readonly summaries: Summaries
  readonly digest: JournalsDigest
  readonly today: () => IsoDate
  readonly afterShown: (work: () => void) => void
  readonly outdated: OutdatedNotice
}

/** Word that an answer the consolidation gave is of a book since written: told by the consolidation, heard by whatever shows it. */
export interface OutdatedNotice {
  readonly tell: () => void
  /** Hear each telling from now on; what is returned stops it. */
  readonly heard: (listener: () => void) => () => void
}

/** A notice told to everyone hearing it at the time. */
export const createOutdatedNotice = (): OutdatedNotice => {
  const listeners = new Set<() => void>()
  return {
    tell: () => listeners.forEach((listener) => listener()),
    heard: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * The consolidation's parts, with how it answers and the digest of each
 * book as it stands now, asked once however many questions want it at
 * the same time.
 */
export interface ConsolidationPorts extends ConsolidationParts {
  /**
   * `at-once` answers with what a book was last answered, without
   * reading it, and checks it after: a screen shown. `when-checked` answers
   * once the book is read: asking ahead, which must not leave work behind.
   */
  readonly answering: "at-once" | "when-checked"
  readonly digestNow: (bookId: BookId) => Promise<string | undefined>
}

/** The consolidation's ports from its parts: a screen's, answering at once. */
export const consolidationPorts = (parts: ConsolidationParts): ConsolidationPorts => {
  const asked = new Map<BookId, Promise<string | undefined>>()
  const digestNow = (bookId: BookId): Promise<string | undefined> => {
    const asking = asked.get(bookId)
    if (asking !== undefined) return asking
    const digested = parts.session.stored(bookId).then(async (stored) => (stored.ok ? parts.digest(stored.value.files) : undefined))
    asked.set(bookId, digested)
    void digested.finally(() => asked.delete(bookId))
    return digested
  }
  return { ...parts, answering: "at-once", digestNow }
}

/** What a book was last answered to a question: the answer, and the digest of the journals it was answered from. */
interface LastAnswered<T> {
  readonly digest: string
  readonly answer: T
}

const isLastAnswered = (value: unknown): value is LastAnswered<unknown> => typeof value === "object" && value !== null && typeof (value as Partial<LastAnswered<unknown>>).digest === "string" && "answer" in value

/**
 * Where a book's answer is kept: under the digest of its journals, or as
 * the book's last, by its id. A question whose answer the day can change
 * says the day that matters to it (`asOfToday`); any other is kept whatever
 * the day.
 */
const answerKey = (digest: string, question: string): string => `${digest}\n${question}`
const lastKey = (book: ListedBook, question: string): string => `last\n${book.id}\n${question}`

/**
 * Whether a question of what stood as of a query's end is asked as of
 * today: where the query leaves its end open, savings are valued at the
 * rate in force today. Everything else the consolidation asks counts each
 * posting at its own day's rate, or stands at a day the query says, and is
 * the same answer whatever day it is asked on.
 */
const asOfToday = (query: string): boolean => daysOfQuery(query)?.until === undefined

/**
 * A question as a book's answer to it is kept: as asked, or, for one asked
 * as of today, with the last day on or before today the book sets a rate
 * on — the day that a value standing today is read at — so that it is
 * asked again only when a rate since then is in force, not every day.
 */
const keyedFor = async (ports: ConsolidationPorts, question: string, dated: boolean, book: ListedBook): Promise<string> => {
  if (!dated) return question
  const stored = await ports.session.stored(book.id)
  return `${question}\n${stored.ok ? lastRateDayOf(stored.value.files, ports.today()) : ports.today()}`
}

/**
 * A book's answer for its journals as they stand: the one kept under their
 * digest where there is one — the book not opened in hledger at all — or
 * else hledger's, kept for the next time and as the book's last. What
 * could not be answered is not kept.
 */
const answered = async <T>(ports: ConsolidationPorts, question: string, read: (book: ListedBook) => Promise<Outcome<T>>, book: ListedBook, digest: string | undefined): Promise<Outcome<T>> => {
  if (digest === undefined) return read(book)
  const kept = await ports.summaries.kept(answerKey(digest, question))
  const answer = kept !== undefined ? Ok(kept as T) : await read(book)
  if (!answer.ok) return answer
  if (kept === undefined) await ports.summaries.keep(answerKey(digest, question), answer.value)
  await ports.summaries.keep(lastKey(book, question), { digest, answer: answer.value } satisfies LastAnswered<T>)
  return answer
}

/**
 * A book's answer to a question as the consolidation asks it. Answering at
 * once, a book answered before gives that answer straight away and is
 * read after: where its journals have changed since, it is answered again
 * and whoever showed the old answer is told. Otherwise the book is read
 * first, and its answer is the one for its journals as they stand.
 */
const summarized =
  <T>(ports: ConsolidationPorts, asked: string, read: (book: ListedBook) => Promise<Outcome<T>>, dated: boolean) =>
  async (book: ListedBook): Promise<Outcome<T>> => {
    const question = await keyedFor(ports, asked, dated, book)
    const last = await ports.summaries.kept(lastKey(book, question))
    const checked = async (): Promise<Outcome<T>> => {
      const digest = await ports.digestNow(book.id)
      if (isLastAnswered(last) && last.digest === digest) return Ok(last.answer as T)
      const answer = await answered(ports, question, read, book, digest)
      if (isLastAnswered(last) && answer.ok) ports.outdated.tell()
      return answer
    }
    if (ports.answering === "when-checked" || !isLastAnswered(last)) return checked()
    ports.afterShown(() => void checked())
    return Ok(last.answer as T)
  }

/** One book after another: hledger holds one journal at a time, so the books are read in turn. */
const inTurn = async <T>(books: readonly ListedBook[], read: (book: ListedBook) => Promise<Outcome<T>>): Promise<readonly ConsolidatedBook<T>[]> => {
  const [book, ...rest] = books
  if (book === undefined) return []
  const first = await read(book)
  return [{ book, read: first }, ...(await inTurn(rest, read))]
}

/**
 * The books chosen, each asked the same thing, book by book; `undefined`
 * chooses every book on the device. What a book answers is its own, from
 * hledger: several books are read as one by adding those, never by
 * valuing anything again across books — two people who kept the same
 * parlor at different rates each keep their own. A book that is chosen
 * and not on the device is passed over.
 */
const ofChosen = async <T>(
  ports: ConsolidationPorts,
  chosen: readonly BookId[] | undefined,
  question: string,
  read: (book: ListedBook) => Promise<Outcome<T>>,
  dated: boolean = false,
): Promise<Outcome<readonly ConsolidatedBook<T>[]>> => {
  const listed = await ports.session.books()
  if (!listed.ok) return listed
  const books = await inTurn(
    listed.value.filter((book) => chosen === undefined || chosen.includes(book.id)),
    summarized(ports, question, read, dated),
  )
  return mapOk(listed, () => books)
}

/** A book's results for a period as one group, the book itself: what the period's tallies made and were worth, as hledger sums them. */
const whole = async (session: BookSession, book: ListedBook, query: string): Promise<Outcome<readonly Group[]>> =>
  mapOk(await loadOverview(session, book.id, combine(talliesTerm, query)), (overview) => [{ key: book.id, actual: overview.actual, theoretical: overview.theoretical, inferred: overview.inferred, seconds: overview.playSeconds ?? ZERO }])

/** The books chosen taken as one, for a period: each book's own figures, added — a day played in several books one day. */
export const loadConsolidatedOverall = async (ports: ConsolidationPorts, chosen: readonly BookId[] | undefined, query: string): Promise<Outcome<readonly ConsolidatedBook<Overall>[]>> =>
  ofChosen(ports, chosen, `overall\n${query}`, (book) => loadOverall(ports.session, book.id, query))

/** その他損益 of the books chosen, for a period, book by book. */
export const loadConsolidatedOtherGains = (ports: ConsolidationPorts, chosen: readonly BookId[] | undefined, query: string): Promise<Outcome<readonly ConsolidatedBook<OtherGains>[]>> =>
  ofChosen(ports, chosen, `other-gains\n${query}`, (book) => loadOtherGains(ports.session, book.id, query), asOfToday(query))

/** The results of the books chosen, for a period, grouped, book by book. */
export const loadConsolidation = (ports: ConsolidationPorts, chosen: readonly BookId[] | undefined, by: ConsolidatedGrouping, query: string): Promise<Outcome<readonly ConsolidatedBook<readonly Group[]>[]>> =>
  ofChosen(ports, chosen, `grouped\n${by}\n${query}`, (book) => {
    if (by === "book") return whole(ports.session, book, query)
    return by === "sender" ? loadSenderBreakdown(ports.session, book.id, query) : loadBreakdown(ports.session, book.id, by, query)
  })

/** The results of the books chosen for a period, day by day and as one, book by book: what a calendar of several books shows, every player's tallies. */
export const loadConsolidatedDaysAndWhole = (ports: ConsolidationPorts, chosen: readonly BookId[] | undefined, query: string): Promise<Outcome<readonly ConsolidatedBook<DaysAndWhole>[]>> =>
  ofChosen(ports, chosen, `days-and-whole\n${query}`, (book) => loadDaysAndWhole(ports.session, book.id, query, { chosen: undefined, offered: [] }))

/** The savings of the books chosen, as of the end of the query's period, book by book: each book's pools at its own rates. */
export const loadConsolidatedHoldings = (ports: ConsolidationPorts, chosen: readonly BookId[] | undefined, query: string): Promise<Outcome<readonly ConsolidatedBook<Holdings>[]>> =>
  ofChosen(ports, chosen, `holdings\n${query}`, (book) => loadHoldings(ports.session, book.id, query), asOfToday(query))

/**
 * Whether any of the books chosen has a theoretical value written in it.
 * Where none has, a sum of theoretical values over them is nothing to
 * show; where one has, the sum is that book's and the others add nothing.
 * A book that could not be asked says nothing either way.
 */
export const consolidationKeepsTheoreticalValues = async (ports: ConsolidationPorts, chosen: readonly BookId[] | undefined): Promise<Outcome<boolean>> =>
  mapOk(await ofChosen(ports, chosen, "keeps-theoretical", (book) => keepsTheoreticalValues(ports.session, book.id)), (books) => books.some((each) => each.read.ok && each.read.value))

/** The spin performances of the books chosen, by machine, for a period: each book's, added. A book that could not be read adds nothing. */
export const loadConsolidatedSpinPerformances = async (ports: ConsolidationPorts, chosen: readonly BookId[] | undefined, query: string): Promise<Outcome<SpinPerformancesByMachine>> =>
  mapOk(await ofChosen(ports, chosen, `spins\n${query}`, (book) => loadSpinPerformances(ports.session, book.id, query)), (books) => mergedSpinPerformances(books.flatMap((each) => (each.read.ok ? [each.read.value] : []))))

/** Who sent the plays of the books chosen, each by the name on their last tally in any of them. A book that could not be read names no one. */
export const loadConsolidatedSenderNames = async (ports: ConsolidationPorts, chosen: readonly BookId[] | undefined): Promise<Outcome<SenderNames>> =>
  mapOk(await ofChosen(ports, chosen, "sender-names", (book) => loadSenderNames(ports.session, book.id)), (books) => mergedSenderNames(books.flatMap((each) => (each.read.ok ? [each.read.value] : []))))

/** What the consolidation is asked ahead about: the month its calendar opens on, and the periods most looked at, the one 集計 opens on first — this year, then this month — each as the screens ask it. */
export interface Warming {
  readonly month: string
  readonly periods: readonly string[]
}

/**
 * What the consolidation opens on, asked ahead and let go, in two rounds
 * over the books: first everything about the periods most looked at — 総合
 * and その他損益 over each, the one 集計 opens on first, a month of the
 * calendar, the savings, and the tallies by machine with their spin
 * performances over each period — then the same over every day. A period's
 * questions are each asked of the files they count, so the first round is
 * quick and the consolidation opens on it at once; every day reads every
 * book whole, and comes after. Within a round each book is asked
 * everything before the next is, so hledger opens it once a round. Each
 * book's answers are kept, so once these are asked the consolidation shows
 * them at once; a book written since is the only one asked again. Each
 * answer waits for its book to be read, so nothing is left to be asked
 * after, and a screen asked meanwhile waits a question of one book at most.
 */
export const warmConsolidation = async (screens: ConsolidationPorts, warming: Warming): Promise<void> => {
  const ports: ConsolidationPorts = { ...screens, answering: "when-checked" }
  const listed = await ports.session.books()
  if (!listed.ok) return
  return oneAfterAnother([...listed.value.flatMap((book) => periodsAhead(ports, [book.id], warming)), ...listed.value.flatMap((book) => everyDayAhead(ports, [book.id]))])
}

/** What the books chosen are asked ahead about the periods most looked at, in the order the screens want it. */
const periodsAhead = (ports: ConsolidationPorts, chosen: readonly BookId[], warming: Warming): readonly (() => Promise<unknown>)[] => [
  () => consolidationKeepsTheoreticalValues(ports, chosen),
  ...warming.periods.flatMap((period) => [() => loadConsolidatedOverall(ports, chosen, period), () => loadConsolidatedOtherGains(ports, chosen, period)]),
  () => loadConsolidatedDaysAndWhole(ports, chosen, warming.month),
  () => loadConsolidatedHoldings(ports, chosen, ""),
  ...warming.periods.flatMap((period) => [() => loadConsolidation(ports, chosen, "machine", period), () => loadConsolidatedSpinPerformances(ports, chosen, period)]),
]

/** What the books chosen are asked ahead about every day. */
const everyDayAhead = (ports: ConsolidationPorts, chosen: readonly BookId[]): readonly (() => Promise<unknown>)[] => [
  () => loadConsolidatedOverall(ports, chosen, ""),
  () => loadConsolidatedOtherGains(ports, chosen, ""),
  () => loadConsolidation(ports, chosen, "machine", ""),
  () => loadConsolidatedSpinPerformances(ports, chosen, ""),
]

/** Things asked one after another, each once the one before has its answer, the answers let go. */
const oneAfterAnother = (asks: readonly (() => Promise<unknown>)[]): Promise<void> =>
  asks.reduce<Promise<void>>((before, ask) => before.then(async () => void (await ask())), Promise.resolve())
