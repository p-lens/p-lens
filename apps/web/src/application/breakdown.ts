import type { BookId } from "../core/book/book"
import { SOURCE_TAGS } from "../core/import/source-tally"
import { readGameKind, writtenGameKinds } from "../core/play/play"
import { PARLOR_ID_TAG, PARLOR_SUBMISSION_TAG, parlorsFromDeclarations, type Parlor } from "../core/parlor/parlor"
import { TALLY_TAGS } from "../core/tally/tally"
import { UNSAID, byColumn, byRow, byWeekday, groupsOf, inOrder, merged, type Dimension, type Group, type Period } from "../core/report/breakdown"
import { isZero, negate, ZERO } from "../core/decimal/decimal"
import { actualOf, secondsIn, secondsOf, statisticTotalOf } from "../core/report/figures"
import { EVERY_TALLY, NARROWED_BY, rateKey, ratesInOrder, readRateKey, type NarrowedBy, type Narrowing } from "../core/report/narrowing"
import { senderNamesOf, type SenderNames } from "../core/report/senders"
import { spinPerformancesOf, type SpinPerformancesByMachine } from "../core/report/spin-performance"
import { andThen, collect, mapOk, Ok } from "../core/result/result"
import type { JournalAccess, Reply } from "../hledger/client/client"
import type { BalanceReport } from "../hledger/protocol/wire"
import { accountsRequest, actualCutRequest, sentTalliesRequest, spinPerformancesRequest, actualRequest, inferredCutRequest, inferredRequest, playTimeCutRequest, playTimeRequest, theoreticalCutRequest, theoreticalRequest } from "../hledger/query/requests"
import { combine, playedTokensTerm, sendersTerm, taggedAmongTerm, talliesTerm, untaggedTerm } from "../hledger/query/terms"
import type { BookSession } from "./book-session"
import { viewedFor } from "./book-views"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"
import { askUserTags, USER_TAG_NAMES } from "./user-tags"

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

/** What four reports — an income statement, a balance of theoretical values, a balance of the inferred among them and a balance of play time — come to as one group under a key: each report's total, hledger's. */
const totalsAsOne = (key: string, [statement, theoretical, inferred, time]: Reports): Outcome<readonly Group[]> =>
  andThen(andThen(fromHledger(statement), (report) => fromReport(actualOf(report))), (actual) =>
    andThen(andThen(fromHledger(theoretical), (report) => fromReport(statisticTotalOf(report))), (worth) =>
      andThen(andThen(fromHledger(inferred), (report) => fromReport(statisticTotalOf(report))), (taken) =>
        mapOk(mapOk(fromHledger(time), secondsOf), (played) => groupsOf(new Map([[key, negate(actual)]]), new Map([[key, worth]]), new Map([[key, taken]]), new Map([[key, played ?? ZERO]]))),
      ),
    ),
  )

/** The four reports a group's figures are read from, each as hledger answered it. */
type Reports = readonly [Reply<BalanceReport>, Reply<BalanceReport>, Reply<BalanceReport>, Reply<BalanceReport>]

/** Everything a query matches as one group under a key: the four reports, none cut. */
const whole = async (journal: JournalAccess, query: string, key: string): Promise<Outcome<readonly Group[]>> =>
  totalsAsOne(key, await Promise.all([journal.ask(actualRequest(query)), journal.ask(theoreticalRequest(query)), journal.ask(inferredRequest(query)), journal.ask(playTimeRequest(query))]))

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

/** The four reports of a query, each with a column a period. */
const periodReports = (journal: JournalAccess, query: string, period: Period): Promise<Reports> => {
  const cut = { interval: period }
  return Promise.all([journal.ask(actualCutRequest(query, cut)), journal.ask(theoreticalCutRequest(query, cut)), journal.ask(inferredCutRequest(query, cut)), journal.ask(playTimeCutRequest(query, cut))])
}

/** The groups four reports cut by period come to, a group a period. */
const byColumns = (period: Period, [statement, theoretical, inferred, time]: Reports): Outcome<readonly Group[]> =>
  andThen(andThen(fromHledger(statement), (report) => fromReport(byColumn(report, period))), (made) =>
    andThen(andThen(fromHledger(theoretical), (report) => fromReport(byColumn(report, period))), (worth) =>
      andThen(andThen(fromHledger(inferred), (report) => fromReport(byColumn(report, period))), (taken) => mapOk(andThen(fromHledger(time), (report) => fromReport(byColumn(report, period, secondsIn))), (played) => groupsOf(made, worth, taken, played))),
    ),
  )

/** The tallies of a query grouped by period, each period's figures hledger's: the four reports, each with a column a period. */
const byPeriod = async (journal: JournalAccess, query: string, period: Period): Promise<Outcome<readonly Group[]>> => byColumns(period, await periodReports(journal, query, period))

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

/** The tallies of a query grouped by game: what a book wrote before pachislot's name was settled is one game with what it writes now. */
const byGame = async (journal: JournalAccess, query: string): Promise<Outcome<readonly Group[]>> =>
  mapOk(await byTags(journal, query, [TALLY_TAGS.gameKind]), (groups) => merged([groups.map((group) => ({ ...group, key: readGameKind(group.key) ?? group.key }))]))

/** What a tally carries a tag for among what it can be narrowed by: all of it but its rate, which is in the name of the tokens it played. */
type Tagged = Exclude<NarrowedBy, "rate">

/** The tags a tally says each of those in, the first it is tied to the lists by and the rest what another app called it. */
const NARROWING_TAGS: Readonly<Record<Tagged, readonly string[]>> = {
  tag: USER_TAG_NAMES,
  game: [TALLY_TAGS.gameKind],
  parlor: [PARLOR_ID_TAG, PARLOR_SUBMISSION_TAG, SOURCE_TAGS.parlor],
  machine: [TALLY_TAGS.machine, SOURCE_TAGS.machine],
}

/** The values chosen groups are written as: a game as each way a book has said it, a parlor by its name and by the id of each parlor of that name, a machine as its key. */
const writtenAs = (by: Tagged, chosen: readonly string[], parlors: readonly Parlor[]): readonly string[] => {
  switch (by) {
    case "game":
      return chosen.flatMap((key) => ((kind) => (kind === undefined ? [key] : writtenGameKinds(kind)))(readGameKind(key)))
    case "parlor":
      return [...chosen, ...parlors.filter((parlor) => chosen.includes(parlor.name)).map((parlor) => (parlor.identity.type === "listed" ? parlor.identity.id : parlor.identity.submission))]
    case "machine":
    case "tag":
      return chosen
  }
}

/** What chosen groups are written as in a term: a rate as the tokens its tallies played, anything else as any of its tags with any of the values the groups are written as. */
const termOf = (by: NarrowedBy, chosen: readonly string[], parlors: readonly Parlor[]): string =>
  by === "rate" ? playedTokensTerm(chosen.flatMap((key) => ((pool) => (pool === undefined ? [] : [pool]))(readRateKey(key)))) : taggedAmongTerm(NARROWING_TAGS[by], writtenAs(by, chosen, parlors))

/**
 * The terms a narrowing asks with, one for each dimension it narrows by:
 * for a game, a parlor or a machine, a tally carrying any of its tags with
 * any of the values its chosen groups are written as; for a rate, a tally
 * that played its tokens, which a tally kept in yen alone never does. The
 * parlors are read only where some are chosen. A narrowing that matches
 * nothing is not asked about (`matchesNothing`).
 */
export const narrowedTerm = async (journal: JournalAccess, narrowing: Narrowing): Promise<Outcome<string>> => {
  const chosen = NARROWED_BY.flatMap((by) => ((values) => (values === undefined ? [] : [[by, values] as const]))(narrowing[by]))
  const parlors = narrowing.parlor === undefined ? Ok([]) : await parlorsIn(journal)
  return mapOk(parlors, (found) => combine(...chosen.map(([by, values]) => termOf(by, values, found))))
}

/** Whether a group came to nothing at all: no tally of it was played, made or lost anything, or was worth anything. */
const isNothing = (group: Group): boolean => [group.actual, group.theoretical, group.inferred, group.seconds].every(isZero)

/**
 * The tallies of a query grouped by the words they are tagged with, mine
 * and another app's alike: a tally tagged with several is in the group of
 * each, so the groups add up to more than the whole. hledger pivots on a
 * tag's first value alone, so each word is asked about by itself — the
 * words being those the query's tallies are tagged with — and the tallies
 * tagged with none are the unnamed group, where there are any.
 */
const byUserTag = async (journal: JournalAccess, query: string): Promise<Outcome<readonly Group[]>> => {
  const tags = await askUserTags(journal, query)
  if (!tags.ok) return tags
  const [tagged, untagged] = await Promise.all([
    Promise.all(tags.value.map((tag) => whole(journal, combine(query, taggedAmongTerm(USER_TAG_NAMES, [tag])), tag))),
    whole(journal, combine(query, ...USER_TAG_NAMES.map(untaggedTerm)), UNSAID),
  ])
  return mapOk(collect([...tagged, untagged]), (groups) => groups.flat().filter((group) => group.key !== UNSAID || !isNothing(group)))
}

/** Every rate the book keeps savings at, of either kind of token, by `rateKey`: what a breakdown can be narrowed to by rate, in `ratesInOrder`. */
export const loadRates = (session: BookSession, bookId: BookId): Promise<Outcome<readonly string[]>> =>
  session.read(bookId, async (journal) => mapOk(await parlorsIn(journal), (parlors) => ratesInOrder(parlors.flatMap((parlor) => parlor.pools).map(rateKey))))

const grouped = async (journal: JournalAccess, dimension: Dimension, query: string): Promise<Outcome<readonly Group[]>> => {
  switch (dimension) {
    case "machine":
      return byTags(journal, query, [TALLY_TAGS.machine, SOURCE_TAGS.machine])
    case "parlor":
      return byParlor(journal, query)
    case "game":
      return byGame(journal, query)
    case "year":
      return byPeriod(journal, query, "yearly")
    case "month":
      return byPeriod(journal, query, "monthly")
    case "day":
      return byPeriod(journal, query, "daily")
    case "weekday":
      return mapOk(await byPeriod(journal, query, "daily"), byWeekday)
    case "tag":
      return byUserTag(journal, query)
  }
}

/**
 * A book's results for a period, grouped by a dimension, in the order the
 * dimension is read in. hledger does the grouping and the sums: by a tag's
 * values (`--pivot`) for a machine, a parlor or a game, and by
 * period (`-Y`, `-M`, `-D`) for a year, a month or a day. It has no
 * grouping by the day of the week, so that one is its daily report folded
 * into seven. Only tallies are grouped: what is no play's — 失効損 — is
 * said under the breakdown, in その他損益, and never as a group of its own.
 * A narrowing keeps to the tallies of the games, parlors and machines it
 * chose.
 */
export const loadBreakdown = (session: BookSession, bookId: BookId, dimension: Dimension, query: string, narrowing: Narrowing = EVERY_TALLY): Promise<Outcome<readonly Group[]>> =>
  viewedFor(session, query, "moved").read(bookId, async (journal) => {
    const narrowed = await narrowedTerm(journal, narrowing)
    return narrowed.ok ? mapOk(await grouped(journal, dimension, combine(talliesTerm, query, narrowed.value)), (groups) => inOrder(groups, dimension)) : narrowed
  })

/** Who of those that played a book its tallies are asked of: every one, or those chosen of those offered, by sender id and `UNSENT`. */
export interface Players {
  readonly chosen: readonly string[] | undefined
  readonly offered: readonly string[]
}

/** A period's results day by day and taken as one: what a calendar shows of a month. */
export interface DaysAndWhole {
  readonly days: readonly Group[]
  readonly whole: readonly Group[]
}

/** The key the period taken as one is kept under. */
const WHOLE_PERIOD = "whole"

/**
 * A book's results for a period day by day and as one, of the tallies of
 * those chosen among who played them: the four reports asked once, by
 * day — the days their columns, and the whole their totals, which are
 * hledger's sum of the days. Nothing at all where nobody is chosen.
 */
export const loadDaysAndWhole = (session: BookSession, bookId: BookId, query: string, players: Players): Promise<Outcome<DaysAndWhole>> => {
  const term = players.chosen === undefined ? "" : sendersTerm(players.chosen, players.offered)
  if (term === undefined) return Promise.resolve(Ok({ days: [], whole: [] }))
  return viewedFor(session, query, "moved").read(bookId, async (journal) => {
    const reports = await periodReports(journal, combine(talliesTerm, query, term), "daily")
    return andThen(byColumns("daily", reports), (days) => mapOk(totalsAsOne(WHOLE_PERIOD, reports), (whole) => ({ days: inOrder(days, "day"), whole })))
  })
}

/**
 * A book's tallies' spin performances for a period, by machine: what the
 * tallies grouped by machine are read beside. hledger finds the tallies that
 * say one, of those a narrowing keeps to; it keeps a tag's value and does
 * not add it up, so the adding is the app's.
 */
export const loadSpinPerformances = (session: BookSession, bookId: BookId, query: string, narrowing: Narrowing = EVERY_TALLY): Promise<Outcome<SpinPerformancesByMachine>> =>
  viewedFor(session, query, "moved").read(bookId, async (journal) => {
    const narrowed = await narrowedTerm(journal, narrowing)
    return narrowed.ok ? mapOk(fromHledger(await journal.ask(spinPerformancesRequest(combine(query, narrowed.value)))), (page) => spinPerformancesOf(page.items)) : narrowed
  })

/**
 * A book's results for a period, by who played them: each sender by the id
 * their tallies carry, and the tallies that name no one — the owner's own,
 * and plays taken in before senders were written — as the unnamed group.
 * A narrowing keeps to the tallies it chose.
 */
export const loadSenderBreakdown = (session: BookSession, bookId: BookId, query: string, narrowing: Narrowing = EVERY_TALLY): Promise<Outcome<readonly Group[]>> =>
  viewedFor(session, query, "moved").read(bookId, async (journal) => {
    const narrowed = await narrowedTerm(journal, narrowing)
    return narrowed.ok ? byTags(journal, combine(talliesTerm, query, narrowed.value), [TALLY_TAGS.senderId]) : narrowed
  })

/** Who sent a book's plays, each by the name on their last tally, whatever the period: the name a person goes by now. */
export const loadSenderNames = (session: BookSession, bookId: BookId): Promise<Outcome<SenderNames>> =>
  session.read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(sentTalliesRequest)), (page) => senderNamesOf(page.items)))
