import type { BookId } from "../core/book/book"
import { SOURCE_TAGS } from "../core/import/source-tally"
import { PARLOR_ID_TAG, PARLOR_SUBMISSION_TAG, parlorsFromDeclarations, type Parlor } from "../core/parlor/parlor"
import { TALLY_TAGS } from "../core/tally/tally"
import { UNSAID, byColumn, byRow, byWeekday, groupsOf, inOrder, merged, type Dimension, type Group, type Period } from "../core/report/breakdown"
import { negate, ZERO } from "../core/decimal/decimal"
import { actualOf, secondsIn, secondsOf, statisticTotalOf } from "../core/report/figures"
import { senderNamesOf, type SenderNames } from "../core/report/senders"
import { spinPerformancesOf, type SpinPerformancesByMachine } from "../core/report/spin-performance"
import { andThen, mapOk } from "../core/result/result"
import type { JournalAccess } from "../hledger/client/client"
import { accountsRequest, actualCutRequest, sentTalliesRequest, spinPerformancesRequest, actualRequest, inferredCutRequest, inferredRequest, playTimeCutRequest, playTimeRequest, theoreticalCutRequest, theoreticalRequest } from "../hledger/query/requests"
import { combine, untaggedTerm } from "../hledger/query/terms"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/** The tallies of a query grouped by one tag's values, each group's figures hledger's: an income statement, a balance of theoretical values, a balance of the inferred among them and a balance of play time, all pivoted on the tag. */
const byTag = async (journal: JournalAccess, query: string, tag: string): Promise<Outcome<readonly Group[]>> => {
  const cut = { pivot: tag }
  const [statement, theoretical, inferred, time] = await Promise.all([journal.ask(actualCutRequest(query, cut)), journal.ask(theoreticalCutRequest(query, cut)), journal.ask(inferredCutRequest(query, cut)), journal.ask(playTimeCutRequest(query, cut))])
  return andThen(andThen(fromHledger(statement), (report) => fromReport(byRow(report))), (made) =>
    andThen(andThen(fromHledger(theoretical), (report) => fromReport(byRow(report))), (worth) =>
      andThen(andThen(fromHledger(inferred), (report) => fromReport(byRow(report))), (taken) => mapOk(andThen(fromHledger(time), (report) => fromReport(byRow(report, secondsIn))), (played) => groupsOf(made, worth, taken, played))),
    ),
  )
}

/** Everything a query matches as one group under a key: an income statement, a balance of theoretical values, a balance of the inferred among them and a balance of play time, none cut. */
const whole = async (journal: JournalAccess, query: string, key: string): Promise<Outcome<readonly Group[]>> => {
  const [statement, theoretical, inferred, time] = await Promise.all([journal.ask(actualRequest(query)), journal.ask(theoreticalRequest(query)), journal.ask(inferredRequest(query)), journal.ask(playTimeRequest(query))])
  return andThen(andThen(fromHledger(statement), (report) => fromReport(actualOf(report))), (actual) =>
    andThen(andThen(fromHledger(theoretical), (report) => fromReport(statisticTotalOf(report))), (worth) =>
      andThen(andThen(fromHledger(inferred), (report) => fromReport(statisticTotalOf(report))), (taken) =>
        mapOk(mapOk(fromHledger(time), secondsOf), (played) => groupsOf(new Map([[key, negate(actual)]]), new Map([[key, worth]]), new Map([[key, taken]]), new Map([[key, played ?? ZERO]]))),
      ),
    ),
  )
}

/**
 * The tallies of a query grouped by the first of several tags each carries.
 * A tally is tied to the lists by one tag, and says what another app called
 * things by another: grouped by the first, what carries none of it is
 * grouped by the next, and so on, each time by asking for what does not
 * carry the tags before. What carries none of them is the unnamed group,
 * asked for the same way and not cut — a pivoted report has no row for it.
 */
const byTags = async (journal: JournalAccess, query: string, tags: readonly string[]): Promise<Outcome<readonly Group[]>> => {
  const [tag, ...rest] = tags
  if (tag === undefined) return whole(journal, query, UNSAID)
  const groups = await byTag(journal, query, tag)
  if (!groups.ok) return groups
  return mapOk(await byTags(journal, combine(query, untaggedTerm(tag)), rest), (further) => [...groups.value.filter((group) => group.key !== UNSAID), ...further])
}

/** The tallies of a query grouped by period, each period's figures hledger's: the four reports, each with a column a period. */
const byPeriod = async (journal: JournalAccess, query: string, period: Period): Promise<Outcome<readonly Group[]>> => {
  const cut = { interval: period }
  const [statement, theoretical, inferred, time] = await Promise.all([journal.ask(actualCutRequest(query, cut)), journal.ask(theoreticalCutRequest(query, cut)), journal.ask(inferredCutRequest(query, cut)), journal.ask(playTimeCutRequest(query, cut))])
  return andThen(andThen(fromHledger(statement), (report) => fromReport(byColumn(report, period))), (made) =>
    andThen(andThen(fromHledger(theoretical), (report) => fromReport(byColumn(report, period))), (worth) =>
      andThen(andThen(fromHledger(inferred), (report) => fromReport(byColumn(report, period))), (taken) => mapOk(andThen(fromHledger(time), (report) => fromReport(byColumn(report, period, secondsIn))), (played) => groupsOf(made, worth, taken, played))),
    ),
  )
}

/** A parlor's group under its name: the list's id, or a submission's, is what its tallies are tagged with and no one's to read. Two keys of one name are one parlor. */
const named = (groups: readonly Group[], parlors: readonly Parlor[]): readonly Group[] => {
  const nameOf = (key: string): string => parlors.find((parlor) => (parlor.identity.type === "listed" ? parlor.identity.id : parlor.identity.submission) === key)?.name ?? key
  return merged(groups.map((group) => [{ ...group, key: nameOf(group.key) }]))
}

const parlorsIn = async (journal: JournalAccess): Promise<Outcome<readonly Parlor[]>> => mapOk(fromHledger(await journal.ask(accountsRequest)), parlorsFromDeclarations)

/** The tallies of a query grouped by parlor: by the tag that ties a tally to one, then named as the book names it. */
const byParlor = async (journal: JournalAccess, query: string): Promise<Outcome<readonly Group[]>> => {
  const groups = await byTags(journal, query, [PARLOR_ID_TAG, PARLOR_SUBMISSION_TAG, SOURCE_TAGS.parlor])
  return groups.ok ? mapOk(await parlorsIn(journal), (parlors) => named(groups.value, parlors)) : groups
}

const grouped = async (journal: JournalAccess, dimension: Dimension, query: string): Promise<Outcome<readonly Group[]>> => {
  switch (dimension) {
    case "machine":
      return byTags(journal, query, [TALLY_TAGS.machine, SOURCE_TAGS.machine])
    case "parlor":
      return byParlor(journal, query)
    case "game":
      return byTags(journal, query, [TALLY_TAGS.gameKind])
    case "year":
      return byPeriod(journal, query, "yearly")
    case "month":
      return byPeriod(journal, query, "monthly")
    case "day":
      return byPeriod(journal, query, "daily")
    case "weekday":
      return mapOk(await byPeriod(journal, query, "daily"), byWeekday)
  }
}

/**
 * A book's results for a period, grouped by a dimension, in the order the
 * dimension is read in. hledger does the grouping and the sums: by a tag's
 * values (`--pivot`) for a machine, a parlor or a game, and by
 * period (`-Y`, `-M`, `-D`) for a year, a month or a day. It has no
 * grouping by the day of the week, so that one is its daily report folded
 * into seven.
 */
export const loadBreakdown = (session: BookSession, bookId: BookId, dimension: Dimension, query: string): Promise<Outcome<readonly Group[]>> =>
  session.read(bookId, async (journal) => mapOk(await grouped(journal, dimension, query), (groups) => inOrder(groups, dimension)))

/**
 * A book's tallies' spin performances for a period, by machine: what the
 * tallies grouped by machine are read beside. hledger finds the tallies that
 * say one; it keeps a tag's value and does not add it up, so the adding is
 * the app's.
 */
export const loadSpinPerformances = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<SpinPerformancesByMachine>> =>
  session.read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(spinPerformancesRequest(query))), (page) => spinPerformancesOf(page.items)))

/**
 * A book's results for a period, by who played them: each sender by the id
 * their tallies carry, and the tallies that name no one — the owner's own,
 * and plays taken in before senders were written — as the unnamed group.
 */
export const loadSenderBreakdown = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<readonly Group[]>> =>
  session.read(bookId, (journal) => byTags(journal, query, [TALLY_TAGS.senderId]))

/** Who sent a book's plays, each by the name on their last tally, whatever the period: the name a person goes by now. */
export const loadSenderNames = (session: BookSession, bookId: BookId): Promise<Outcome<SenderNames>> =>
  session.read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(sentTalliesRequest)), (page) => senderNamesOf(page.items)))
