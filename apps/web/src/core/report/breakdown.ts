import type { BalanceReport, MixedAmount } from "../../hledger/protocol/wire"
import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { ZERO, add, compare, negate, type Decimal } from "../decimal/decimal"
import { collect, mapOk, type Result } from "../result/result"
import { yenOf, type ReportError } from "./figures"

/** How one report's amounts are read: as yen, or as seconds. */
type Reading = (amount: MixedAmount) => Result<Decimal, ReportError>

/** What tallies are grouped by, each a way of asking where the results came from. */
export const DIMENSIONS = ["machine", "parlor", "weekday", "tag", "game", "year", "month", "day"] as const

export type Dimension = (typeof DIMENSIONS)[number]

export const isDimension = (text: string): text is Dimension => (DIMENSIONS as readonly string[]).includes(text)

/** Tallies taken as one rather than grouped: 総合, what a breakdown opens on. */
export const OVERALL = "overall"

/** What a breakdown shows: its tallies taken as one, or grouped by a dimension. */
export type BreakdownBy = typeof OVERALL | Dimension

export const isBreakdownBy = (text: string): text is BreakdownBy => text === OVERALL || isDimension(text)

/** The key of the group whose tallies do not say what a dimension asks: hledger's row for what carries no such tag. */
export const UNSAID = ""

/**
 * What a group's tallies come to taken one by one: how many came out ahead
 * and how many behind — one that came out dead even is counted as neither,
 * and as no play — and what they took in and gave back, each at its own
 * day's rate, every expense and all revenue, an even one's among them.
 * Each tally's figures are hledger's; the counting and the adding are the
 * app's.
 */
export interface Tallies {
  readonly won: number
  readonly lost: number
  readonly spent: Decimal
  readonly returned: Decimal
}

export const NO_TALLIES: Tallies = { won: 0, lost: 0, spent: ZERO, returned: ZERO }

const addedTallies = (left: Tallies, right: Tallies): Tallies => ({
  won: left.won + right.won,
  lost: left.lost + right.lost,
  spent: add(left.spent, right.spent),
  returned: add(left.returned, right.returned),
})

/**
 * The tallies that share one answer to a dimension, together: what they made
 * and what they were worth by their formulas — and how much of that worth
 * was inferred from what was told of them, not measured as their plays
 * were played, which is in the worth and said beside it. Each is hledger's sum
 * — a row of a report pivoted on a tag, or a column of one with an
 * interval.
 */
export interface Group {
  readonly key: string
  readonly actual: Decimal
  readonly theoretical: Decimal
  readonly inferred: Decimal
  /** The seconds the tallies were played for, as their entries keep them; nought where none keeps any. */
  readonly seconds: Decimal
  /** The tallies taken one by one, where that was asked for (`tallied`): only a breakdown's list shows them, and the rest leave them unasked. */
  readonly tallies?: Tallies
}

/** One tally's yen in one report, under the key of the group it falls in. */
export interface TallyYen {
  readonly key: string
  readonly playId: string
  readonly yen: Decimal
}

const tallyYenOf = (key: string, playId: string, amount: MixedAmount): Result<TallyYen, ReportError> => mapOk(yenOf(amount), (yen) => ({ key, playId, yen }))

/**
 * A report pivoted on a tag and a tally's id together (`tag:play-id`) as
 * each tally's yen under the tag's value: the id is the last part of a
 * row's name, and has no colon in it, so what is before the last colon is
 * the value, colons and all, empty for a tally that carries no such tag.
 */
export const eachTallyByTag = (report: BalanceReport): Result<readonly TallyYen[], ReportError> =>
  collect(
    report.prRows.map((row) => {
      const name = typeof row.prrName === "string" ? row.prrName : ""
      const at = name.lastIndexOf(":")
      return tallyYenOf(at < 0 ? UNSAID : name.slice(0, at), name.slice(at + 1), row.prrTotal)
    }),
  )

/** A report pivoted on a tally's id as each tally's yen, every one under one key. */
export const eachTallyAs =
  (key: string) =>
  (report: BalanceReport): Result<readonly TallyYen[], ReportError> =>
    collect(report.prRows.map((row) => tallyYenOf(key, typeof row.prrName === "string" ? row.prrName : "", row.prrTotal)))

/** A report pivoted on a tally's id, with a column a period, as each tally's yen under the period it fell in: the one column it has anything in. */
export const eachTallyByColumn = (report: BalanceReport, period: Period): Result<readonly TallyYen[], ReportError> =>
  collect(
    report.prRows.flatMap((row) =>
      row.prrAmounts.flatMap((amount, index) => {
        const began = parseIsoDate(report.prDates[index]?.[0]?.contents ?? "")
        return amount.length === 0 || !began.ok ? [] : [tallyYenOf(PERIOD_KEYS[period](began.value), typeof row.prrName === "string" ? row.prrName : "", amount)]
      }),
    ),
  )

/** One tally's figure in one report, as what it took in or gave back. */
interface Side {
  readonly key: string
  readonly playId: string
  readonly spent: Decimal
  readonly returned: Decimal
}

/** Text in the order of its code units: what sorts the same next to each other, fast, whatever the order means. */
const byText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

/** A sorted list cut into its runs of things that are the same, each run with the first of it. */
const runsOf = <T>(sorted: readonly T[], same: (left: T, right: T) => boolean): readonly { readonly first: T; readonly run: readonly T[] }[] => {
  const starts = sorted.flatMap((item, at) => ((before) => (before === undefined || !same(before, item) ? [{ first: item, at }] : []))(sorted[at - 1]))
  return starts.map((start, index) => ({ first: start.first, run: sorted.slice(start.at, starts[index + 1]?.at ?? sorted.length) }))
}

const tallyOf = (sides: readonly Side[]): Tallies => {
  const spent = sides.reduce((sum, side) => add(sum, side.spent), ZERO)
  const returned = sides.reduce((sum, side) => add(sum, side.returned), ZERO)
  const way = compare(returned, spent)
  return { won: way > 0 ? 1 : 0, lost: way < 0 ? 1 : 0, spent, returned }
}

/**
 * Each group's tallies taken one by one, from what each tally took in — its
 * expenses — and what it gave back — its revenue, which arrives negative
 * and is turned over. A tally is any that took in or gave back something.
 * Sorted by group and tally, so that each tally's figures and then each
 * group's tallies stand together.
 */
export const talliesOf = (spent: readonly TallyYen[], revenue: readonly TallyYen[]): ReadonlyMap<string, Tallies> => {
  const sides = [...spent.map((figure) => ({ key: figure.key, playId: figure.playId, spent: figure.yen, returned: ZERO })), ...revenue.map((figure) => ({ key: figure.key, playId: figure.playId, spent: ZERO, returned: negate(figure.yen) }))].toSorted(
    (left, right) => byText(left.key, right.key) || byText(left.playId, right.playId),
  )
  const tallies = runsOf(sides, (left, right) => left.key === right.key && left.playId === right.playId).map(({ first, run }) => ({ key: first.key, tally: tallyOf(run) }))
  return new Map(runsOf(tallies, (left, right) => left.key === right.key).map(({ first, run }) => [first.key, run.reduce((sum, each) => addedTallies(sum, each.tally), NO_TALLIES)] as const))
}

/** One figure a group, by key, as one report gives it. */
type Figures = ReadonlyMap<string, Decimal>

const figuresOf = (pairs: readonly (readonly [string, MixedAmount])[], reading: Reading): Result<Figures, ReportError> =>
  mapOk(collect(pairs.map(([key, amount]) => mapOk(reading(amount), (figure) => [key, figure] as const))), (read) => new Map(read))

/** A pivoted report's rows as figures by the tag's value: each row's total, the row for what carries no such tag under the empty key. */
export const byRow = (report: BalanceReport, reading: Reading = yenOf): Result<Figures, ReportError> => figuresOf(report.prRows.map((row) => [typeof row.prrName === "string" ? row.prrName : UNSAID, row.prrTotal]), reading)

/** A day as the key of the period it begins, as long as the period is: a year, a month, or itself. */
const PERIOD_KEYS = { yearly: (day: IsoDate) => day.slice(0, 4), monthly: (day: IsoDate) => day.slice(0, 7), daily: (day: IsoDate) => day as string } as const

export type Period = keyof typeof PERIOD_KEYS

/** A report's columns as figures by period: each column's total over every row, a column whose start does not read left out. */
export const byColumn = (report: BalanceReport, period: Period, reading: Reading = yenOf): Result<Figures, ReportError> =>
  figuresOf(
    report.prDates.flatMap((span, index) => {
      const began = parseIsoDate(span[0]?.contents ?? "")
      return began.ok ? [[PERIOD_KEYS[period](began.value), report.prTotals.prrAmounts[index] ?? []] as const] : []
    }),
    reading,
  )

/**
 * Groups from what an income statement, a balance of theoretical values,
 * a balance of the inferred among those and a balance of play time, cut
 * alike, each say of them, and their tallies one by one where those were
 * asked for, a group none of whose tallies took in or gave back anything
 * having none.
 * An income statement's total is turned over, as it is read: revenue is a
 * credit. A group one report has and another lacks stands at nothing in
 * the other, and a group that made nothing, was worth nothing and was
 * played for no time is no group: one played to ±¥0 is still one.
 */
export const groupsOf = (statement: Figures, theoretical: Figures, inferred: Figures, seconds: Figures, tallies: ReadonlyMap<string, Tallies> | undefined): readonly Group[] =>
  [...new Set([...statement.keys(), ...theoretical.keys(), ...seconds.keys()])]
    .map((key) => ({
      key,
      actual: negate(statement.get(key) ?? ZERO),
      theoretical: theoretical.get(key) ?? ZERO,
      inferred: inferred.get(key) ?? ZERO,
      seconds: seconds.get(key) ?? ZERO,
      ...(tallies === undefined ? {} : { tallies: tallies.get(key) ?? NO_TALLIES }),
    }))
    .filter((group) => compare(group.actual, ZERO) !== 0 || compare(group.theoretical, ZERO) !== 0 || compare(group.seconds, ZERO) !== 0)

/** Groups added into one under a key: their tallies too where every one of them has its tallies, and none where any lacks them. */
const together = (key: string, groups: readonly Group[]): Group => ({
  ...groups.reduce(
    (total, group) => ({ key, actual: add(total.actual, group.actual), theoretical: add(total.theoretical, group.theoretical), inferred: add(total.inferred, group.inferred), seconds: add(total.seconds, group.seconds) }),
    { key, actual: ZERO, theoretical: ZERO, inferred: ZERO, seconds: ZERO },
  ),
  ...(groups.length > 0 && groups.every((group) => group.tallies !== undefined) ? { tallies: groups.reduce((sum, group) => addedTallies(sum, group.tallies ?? NO_TALLIES), NO_TALLIES) } : {}),
})

/** The same groups from several books, each key's figures added: books are read one at a time, and several are one by adding what each says. */
export const merged = (books: readonly (readonly Group[])[]): readonly Group[] => {
  const all = books.flat()
  return [...new Set(all.map((group) => group.key))].map((key) => together(key, all.filter((group) => group.key === key)))
}

/** The day of the week a day is, Monday as 0: the week as a parlor's regular counts it, the weekend last. */
const weekdayOf = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number)
  return (new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay() + 6) % 7
}

/**
 * Days folded into the seven days of the week. hledger groups by tag and by
 * period and has no grouping by weekday, so each day's figures are its own,
 * from a daily report, and the seven are those added.
 */
export const byWeekday = (days: readonly Group[]): readonly Group[] => {
  const weekdays = [...new Set(days.map((group) => weekdayOf(group.key)))]
  return weekdays.map((weekday) => together(String(weekday), days.filter((group) => weekdayOf(group.key) === weekday)))
}

const byKey = (left: Group, right: Group): number => left.key.localeCompare(right.key)

const byActual = (left: Group, right: Group): number => compare(right.actual, left.actual)

/**
 * How a dimension's groups are set in order. Time runs: the days of the
 * week from Monday, and years, months and days newest first. Anything else
 * is read for what made most, so the best comes first and the worst last.
 */
const ORDERS: Readonly<Record<Dimension, (left: Group, right: Group) => number>> = {
  machine: byActual,
  parlor: byActual,
  game: byActual,
  tag: byActual,
  weekday: byKey,
  year: (left, right) => byKey(right, left),
  month: (left, right) => byKey(right, left),
  day: (left, right) => byKey(right, left),
}

/** Whether a dimension's groups are read for what made most, rather than as time runs. */
export const isRanked = (dimension: Dimension): boolean => ORDERS[dimension] === byActual

/** Groups in the order their dimension is read in. */
export const inOrder = (groups: readonly Group[], dimension: Dimension): readonly Group[] => groups.toSorted(ORDERS[dimension])

/** Every group of a breakdown together: what they come to. */
export const totalOf = (groups: readonly Group[]): Group => together(UNSAID, groups)
