import type { BookId } from "../core/book/book"
import { SOURCE_TAGS } from "../core/import/source-play"
import { PARLOR_ID_TAG, PARLOR_SUBMISSION_TAG, parlorsFromDeclarations, type Parlor } from "../core/parlor/parlor"
import { PLAY_TAGS } from "../core/play/play"
import { UNSAID, byColumn, byRow, byWeekday, groupsOf, inOrder, merged, type Dimension, type Group, type Period } from "../core/report/breakdown"
import { negate } from "../core/decimal/decimal"
import { actualOf, statisticTotalOf } from "../core/report/figures"
import { andThen, mapOk } from "../core/result/result"
import type { JournalAccess } from "../hledger/client/client"
import { accountsRequest, actualCutRequest, actualRequest, theoreticalCutRequest, theoreticalRequest } from "../hledger/query/requests"
import { combine, untaggedTerm } from "../hledger/query/terms"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/** The plays of a query grouped by one tag's values, each group's figures hledger's: an income statement and a balance of theoretical values, both pivoted on the tag. */
const byTag = async (journal: JournalAccess, query: string, tag: string): Promise<Outcome<readonly Group[]>> => {
  const [statement, theoretical] = await Promise.all([journal.ask(actualCutRequest(query, { pivot: tag })), journal.ask(theoreticalCutRequest(query, { pivot: tag }))])
  return andThen(andThen(fromHledger(statement), (report) => fromReport(byRow(report))), (made) =>
    mapOk(andThen(fromHledger(theoretical), (report) => fromReport(byRow(report))), (worth) => groupsOf(made, worth)),
  )
}

/** Everything a query matches as one group under a key: an income statement and a balance of theoretical values, neither cut. */
const whole = async (journal: JournalAccess, query: string, key: string): Promise<Outcome<readonly Group[]>> => {
  const [statement, theoretical] = await Promise.all([journal.ask(actualRequest(query)), journal.ask(theoreticalRequest(query))])
  return andThen(andThen(fromHledger(statement), (report) => fromReport(actualOf(report))), (actual) =>
    mapOk(andThen(fromHledger(theoretical), (report) => fromReport(statisticTotalOf(report))), (worth) => groupsOf(new Map([[key, negate(actual)]]), new Map([[key, worth]]))),
  )
}

/**
 * The plays of a query grouped by the first of several tags each carries.
 * A play is tied to the lists by one tag, and says what another app called
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

/** The plays of a query grouped by period, each period's figures hledger's: the two reports, each with a column a period. */
const byPeriod = async (journal: JournalAccess, query: string, period: Period): Promise<Outcome<readonly Group[]>> => {
  const [statement, theoretical] = await Promise.all([journal.ask(actualCutRequest(query, { interval: period })), journal.ask(theoreticalCutRequest(query, { interval: period }))])
  return andThen(andThen(fromHledger(statement), (report) => fromReport(byColumn(report, period))), (made) =>
    mapOk(andThen(fromHledger(theoretical), (report) => fromReport(byColumn(report, period))), (worth) => groupsOf(made, worth)),
  )
}

/** A parlor's group under its name: the list's id, or a submission's, is what its plays are tagged with and no one's to read. Two keys of one name are one parlor. */
const named = (groups: readonly Group[], parlors: readonly Parlor[]): readonly Group[] => {
  const nameOf = (key: string): string => parlors.find((parlor) => (parlor.identity.type === "listed" ? parlor.identity.id : parlor.identity.submission) === key)?.name ?? key
  return merged(groups.map((group) => [{ ...group, key: nameOf(group.key) }]))
}

const parlorsIn = async (journal: JournalAccess): Promise<Outcome<readonly Parlor[]>> => mapOk(fromHledger(await journal.ask(accountsRequest)), parlorsFromDeclarations)

/** The plays of a query grouped by parlor: by the tag that ties a play to one, then named as the book names it. */
const byParlor = async (journal: JournalAccess, query: string): Promise<Outcome<readonly Group[]>> => {
  const groups = await byTags(journal, query, [PARLOR_ID_TAG, PARLOR_SUBMISSION_TAG, SOURCE_TAGS.parlor])
  return groups.ok ? mapOk(await parlorsIn(journal), (parlors) => named(groups.value, parlors)) : groups
}

const grouped = async (journal: JournalAccess, dimension: Dimension, query: string): Promise<Outcome<readonly Group[]>> => {
  switch (dimension) {
    case "machine":
      return byTags(journal, query, [PLAY_TAGS.machine, SOURCE_TAGS.machine])
    case "parlor":
      return byParlor(journal, query)
    case "game":
      return byTags(journal, query, [PLAY_TAGS.gameKind])
    case "maker":
      return byTags(journal, query, [SOURCE_TAGS.maker])
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
 * values (`--pivot`) for a machine, a parlor, a game or a maker, and by
 * period (`-Y`, `-M`, `-D`) for a year, a month or a day. It has no
 * grouping by the day of the week, so that one is its daily report folded
 * into seven.
 */
export const loadBreakdown = (session: BookSession, bookId: BookId, dimension: Dimension, query: string): Promise<Outcome<readonly Group[]>> =>
  session.read(bookId, async (journal) => mapOk(await grouped(journal, dimension, query), (groups) => inOrder(groups, dimension)))
