import type { BookId } from "../core/book/book"
import { parseIsoDate, previousDay, type IsoDate } from "../core/calendar/calendar"
import { tokenCommodity } from "../core/commodity/commodity"
import { isZero, subtract, ZERO, type Decimal, decimal } from "../core/decimal/decimal"
import { renderEntry } from "../core/journal/entry"
import { appendEntry, BOOK_FILES } from "../core/journal/layout"
import type { PoolOpening } from "../core/parlor/opening"
import type { Parlor, SavingsPool } from "../core/parlor/parlor"
import { Err, Ok, mapOk } from "../core/result/result"
import { pricePointsOf } from "../core/report/holdings"
import { andThen } from "../core/result/result"
import { balanceAdjustmentEntry, openingBalanceEntry, prependEntry, withEquityDeclared } from "../core/savings/balance"
import { forfeitureEntry, withForfeitureDeclared, type Forfeiture } from "../core/savings/forfeiture"
import { prizeExchangeEntry, withPrizesDeclared, type PrizeExchange } from "../core/savings/prize-exchange"
import { rateChangeLine, type RateChange } from "../core/savings/rate-change"
import { passbookOf, rateLastSet, type PassbookDay } from "../core/report/passbook"
import { parlorDaysOf, parlorPassbookOf, type ParlorPassbookDay, type PoolPassbook } from "../core/report/parlor-passbook"
import { byColumn } from "../core/report/breakdown"
import { quantityIn, rowTotalOf, yenByDayOf } from "../core/report/figures"
import { readSavingsAccount } from "../core/journal/accounts"
import { negate } from "../core/decimal/decimal"
import type { Transaction } from "../hledger/protocol/wire"
import { compare } from "../core/decimal/decimal"
import { newestEntryRequest, openingBalanceRequest, parlorEntriesRequest, parlorMovedRequest, parlorSavingsByDayRequest, poolEntriesRequest, pricesRequest, savingsQuantityRequest } from "../hledger/query/requests"
import { savingsAccount } from "../core/journal/accounts"
import { accountTerm, combine, parlorSavingsTerm, rangeTerm, untilTerm } from "../hledger/query/terms"
import type { JournalAccess } from "../hledger/client/client"
import { rateOn } from "../core/valuation/valuation"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { loadHoldings } from "./holdings"
import { fromHledger } from "./lift"
import type { ProposedChange } from "./book-session"
import { openPool } from "./parlors"

/** Whether the book already has an opening balance for a pool. */
const openingRegistered = (session: BookSession, bookId: BookId, opening: PoolOpening): Promise<Outcome<boolean>> =>
  session.read(bookId, async (journal) =>
    mapOk(fromHledger(await journal.ask(openingBalanceRequest(opening.pool.kind, opening.parlorName, opening.pool.tier))), (page) => page.total > 0),
  )

/**
 * Register the savings a person already had at a parlor's pool when they
 * began keeping the book: the pool opened in the book if it is not yet —
 * its commodity, its account and the day's rate — then one entry, put at
 * the head of the book's transactions with the other opening balances.
 * A pool begins once: one whose opening balance the book already has is
 * refused, since a second would be added to the first, and its count is
 * put right by an adjustment.
 */
export const registerOpeningBalance = async (session: BookSession, bookId: BookId, opening: PoolOpening, tokens: Decimal): Promise<Outcome<void>> => {
  const registered = await openingRegistered(session, bookId, opening)
  if (!registered.ok) return registered
  if (registered.value) return Err({ type: "opening-balance-registered", parlor: opening.parlorName, tier: opening.pool.tier })
  const parlor = await openPool(session, bookId, opening)
  if (!parlor.ok) return parlor
  const entry = renderEntry(openingBalanceEntry({ parlor: parlor.value, pool: opening.pool, date: opening.date }, tokens))
  return mapOk(
    await session.write(bookId, async (_journal, stored) =>
      Ok({
        files: {
          ...stored.files,
          [BOOK_FILES.accounts]: withEquityDeclared(stored.files[BOOK_FILES.accounts] ?? ""),
          [BOOK_FILES.transactions]: prependEntry(stored.files[BOOK_FILES.transactions] ?? "", entry),
        },
        intent: { type: "savings-opened" as const, parlor: opening.parlorName, tier: opening.pool.tier, date: opening.date, kind: opening.pool.kind, tokens },
      }),
    ),
    () => undefined,
  )
}

/** What putting a pool's savings right came to: an entry written, or nothing where the book already had the count. */
export type Adjusted = { readonly type: "adjusted"; readonly difference: Decimal } | { readonly type: "unchanged" }

const heldOn = async (session: BookSession, bookId: BookId, parlor: Parlor, pool: SavingsPool, date: IsoDate): Promise<Outcome<Decimal>> =>
  mapOk(await loadHoldings(session, bookId, untilTerm(date)), (holdings) => {
    const commodity = tokenCommodity(pool.kind, parlor.name, pool.tier)
    return holdings.parlors.flatMap((held) => held.tokens).find((token) => token.commodity === commodity)?.quantity ?? decimal(0n, 0)
  })

/**
 * Put a pool's savings right as of a day: what the parlor says is there,
 * against what the book has there by the end of that day, the difference
 * written as one entry on that day. A book that already has the count is
 * left alone.
 */
export const adjustBalance = async (session: BookSession, bookId: BookId, parlor: Parlor, pool: SavingsPool, date: IsoDate, actual: Decimal): Promise<Outcome<Adjusted>> => {
  const held = await heldOn(session, bookId, parlor, pool, date)
  if (!held.ok) return held
  const difference = subtract(actual, held.value)
  if (isZero(difference)) return Ok({ type: "unchanged" })
  const entry = renderEntry(balanceAdjustmentEntry({ parlor, pool, date }, difference))
  return mapOk(
    await session.write(bookId, async (_journal, stored) =>
      Ok({
        files: {
          ...stored.files,
          [BOOK_FILES.accounts]: withEquityDeclared(stored.files[BOOK_FILES.accounts] ?? ""),
          [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", entry),
        },
        intent: { type: "savings-adjusted" as const, parlor: parlor.name, tier: pool.tier, date, kind: pool.kind, tokens: actual },
      }),
    ),
    (): Adjusted => ({ type: "adjusted", difference }),
  )
}

/** The book's exchange rate for a pool on a day, or none where it has none by then: what a prize exchange on that day takes the tokens at. */
export const exchangeRateOn = (session: BookSession, bookId: BookId, parlor: Parlor, pool: SavingsPool, date: IsoDate): Promise<Outcome<Decimal | undefined>> =>
  session.read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(pricesRequest(""))), (directives) => rateOn(pricePointsOf(directives), tokenCommodity(pool.kind, parlor.name, pool.tier), date)?.rate))

/**
 * Record savings exchanged for prizes, as one entry and one commit. The
 * pool must hold that many tokens by the end of the day said: more than it
 * holds is refused, since the book would then say tokens were exchanged
 * that it never had. The tokens leave at the book's rate for the day, read
 * at the moment of writing.
 */
export const recordPrizeExchange = async (session: BookSession, bookId: BookId, exchange: PrizeExchange): Promise<Outcome<void>> => {
  const held = await heldOn(session, bookId, exchange.parlor, exchange.pool, exchange.date)
  if (!held.ok) return held
  if (compare(held.value, exchange.tokens) < 0) return Err({ type: "prize-exchange", problem: { type: "savings-short", kind: exchange.pool.kind, held: held.value } })
  return mapOk(
    await session.write(bookId, async (journal, stored) =>
      andThen(fromHledger(await journal.ask(pricesRequest(""))), (directives): Outcome<ProposedChange> => {
        const entry = prizeExchangeEntry(exchange, pricePointsOf(directives))
        return entry.ok
          ? Ok({
              files: {
                ...stored.files,
                [BOOK_FILES.accounts]: withPrizesDeclared(stored.files[BOOK_FILES.accounts] ?? ""),
                [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", renderEntry(entry.value)),
              },
              intent: { type: "savings-exchanged", parlor: exchange.parlor.name, tier: exchange.pool.tier, date: exchange.date, kind: exchange.pool.kind, tokens: exchange.tokens, specialPrizes: exchange.specialPrizes },
            })
          : Err({ type: "prize-exchange", problem: entry.error })
      }),
    ),
    () => undefined,
  )
}

/**
 * Record savings a parlor took back, as one entry and one commit. The pool
 * must hold that many tokens by the end of the day said: more than it
 * holds is refused, since the book would then say tokens were lost that
 * it never had.
 */
export const recordForfeiture = async (session: BookSession, bookId: BookId, forfeiture: Forfeiture): Promise<Outcome<void>> => {
  const held = await heldOn(session, bookId, forfeiture.parlor, forfeiture.pool, forfeiture.date)
  if (!held.ok) return held
  if (compare(held.value, forfeiture.tokens) < 0) return Err({ type: "forfeiture", problem: { type: "savings-short", kind: forfeiture.pool.kind, held: held.value } })
  const entry = forfeitureEntry(forfeiture)
  if (!entry.ok) return Err({ type: "forfeiture", problem: entry.error })
  return mapOk(
    await session.write(bookId, async (_journal, stored) =>
      Ok({
        files: {
          ...stored.files,
          [BOOK_FILES.accounts]: withForfeitureDeclared(stored.files[BOOK_FILES.accounts] ?? ""),
          [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", renderEntry(entry.value)),
        },
        intent: { type: "savings-forfeited" as const, parlor: forfeiture.parlor.name, tier: forfeiture.pool.tier, date: forfeiture.date, kind: forfeiture.pool.kind, tokens: forfeiture.tokens },
      }),
    ),
    () => undefined,
  )
}

/**
 * Set a pool's exchange rate from a day, as one price line and one commit.
 * A rate the book already has on that day is left alone.
 */
export const changeExchangeRate = async (session: BookSession, bookId: BookId, change: RateChange): Promise<Outcome<void>> => {
  const line = await session.read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(pricesRequest(""))), (directives) => rateChangeLine(change, pricePointsOf(directives))))
  if (!line.ok) return line
  if (!line.value.ok) return Err({ type: "rate-change", problem: line.value.error })
  if (line.value.value === undefined) return Ok(undefined)
  const written = line.value.value
  return mapOk(
    await session.write(bookId, async (_journal, stored) =>
      Ok({
        files: { ...stored.files, [BOOK_FILES.prices]: appendEntry(stored.files[BOOK_FILES.prices] ?? "", written) },
        intent: { type: "rate-changed" as const, parlor: change.parlorName, tier: change.pool.tier, date: change.date, rate: change.rate },
      }),
    ),
    () => undefined,
  )
}

/** What a passbook shown from a day held before it: at the end of which day, how much, and the last day anything moved before then. */
export interface HeldBefore<B> {
  readonly through: IsoDate
  readonly balance: B
  readonly lastMoved: IsoDate
}

/**
 * A passbook as far back as it is shown: its days from the day it is shown
 * from, newest first, and what was held before that day, where anything
 * moved before it — whence earlier days are to be had. Shown from no day,
 * it is every day there is, and nothing was held before.
 */
export interface PassbookFrom<D, B> {
  readonly days: readonly D[]
  readonly before: HeldBefore<B> | undefined
}

/** A pool's passbook from a day, and the rate the pool was last set to, however far back. */
export interface PoolPassbookFrom extends PassbookFrom<PassbookDay, Decimal> {
  readonly rate: Decimal | undefined
}

/** The day before the one a passbook is shown from, and the newest entry before it of those `query` matches, where there is one. */
const lastMovedBefore = async (journal: JournalAccess, query: string, from: IsoDate | undefined): Promise<Outcome<{ readonly through: IsoDate; readonly lastMoved: IsoDate } | undefined>> => {
  if (from === undefined) return Ok(undefined)
  const through = previousDay(from)
  return mapOk(fromHledger(await journal.ask(newestEntryRequest(combine(query, rangeTerm(undefined, through))))), (page) =>
    ((newest) => (newest === undefined || !newest.ok ? undefined : { through, lastMoved: newest.value }))(page.items[0] === undefined ? undefined : parseIsoDate(page.items[0].tdate)),
  )
}

/** The tokens each of a parlor's pools, or one pool, held at the end of a day, as hledger sums them, by account. */
const tokensHeldOn = async (journal: JournalAccess, accounts: string, through: IsoDate): Promise<Outcome<(account: string, commodity: string) => Decimal>> =>
  mapOk(fromHledger(await journal.ask(savingsQuantityRequest(rangeTerm(undefined, through), accounts))), (report) => (account, commodity) => ((total) => (total === undefined ? ZERO : quantityIn(total, commodity)))(rowTotalOf(report, account)))

/**
 * A pool's passbook from a day — this year's, as it opens — read from the
 * entries that post to it from then and the book's prices, its balances
 * counted on from what hledger says the pool held the day before. Shown
 * from no day, it is every day there is.
 */
export const loadPassbook = (session: BookSession, bookId: BookId, parlorName: string, pool: SavingsPool, from: IsoDate | undefined): Promise<Outcome<PoolPassbookFrom>> =>
  session.read(bookId, async (journal) => {
    const account = savingsAccount(pool.kind, parlorName, pool.tier)
    const commodity = tokenCommodity(pool.kind, parlorName, pool.tier)
    const [entries, prices, moved] = await Promise.all([journal.ask(poolEntriesRequest(account, rangeTerm(from, undefined))), journal.ask(pricesRequest("")), lastMovedBefore(journal, accountTerm(account), from)])
    if (!moved.ok) return moved
    const held = moved.value === undefined ? Ok(undefined) : mapOk(await tokensHeldOn(journal, accountTerm(account), moved.value.through), (heldBy) => heldBy(account, commodity))
    if (!held.ok) return held
    const before = moved.value === undefined || held.value === undefined ? undefined : { ...moved.value, balance: held.value }
    return andThen(fromHledger(entries), (page) =>
      mapOk(fromHledger(prices), (directives) => {
        const points = pricePointsOf(directives)
        return { days: passbookOf(page.items, account, commodity, points, from === undefined ? undefined : { from, held: before?.balance ?? ZERO }), before, rate: rateLastSet(points, commodity) }
      }),
    )
  })

/** The pools a parlor's entries move, each once, balls before medals and each by its account's name. */
const poolsMovedIn = (entries: readonly Transaction[], parlorName: string): readonly SavingsPool[] =>
  [...new Set(entries.flatMap((entry) => entry.tpostings.map((posting) => posting.paccount)))]
    .sort()
    .flatMap((account) => ((read) => (read !== undefined && read.parlorName === parlorName ? [{ kind: read.kind, tier: read.tier }] : []))(readSavingsAccount(account)))
    .sort((left, right) => (left.kind === right.kind ? 0 : left.kind === "ball" ? -1 : 1))

/** Each of a parlor's pools as its own passbook, from the parlor's entries: an entry belongs to a pool where it posts to its account. Shown from a day, each counts on from what its pool held the day before. */
const poolPassbooksOf = (entries: readonly Transaction[], parlorName: string, prices: Parameters<typeof passbookOf>[3], from: IsoDate | undefined, heldBy: (account: string, commodity: string) => Decimal): readonly PoolPassbook[] =>
  poolsMovedIn(entries, parlorName).map((pool) => {
    const account = savingsAccount(pool.kind, parlorName, pool.tier)
    const commodity = tokenCommodity(pool.kind, parlorName, pool.tier)
    return { pool, days: passbookOf(entries.filter((entry) => entry.tpostings.some((posting) => posting.paccount === account)), account, commodity, prices, from === undefined ? undefined : { from, held: heldBy(account, commodity) }) }
  })

/**
 * A parlor's passbook from a day — this year's, as it opens — every
 * pool's days together, newest first, valued in yen by hledger: what came
 * in and went out at each day's rate, and what was held at each day's end
 * at the rate in force then, asked once for a column a day, the day before
 * the first among them where anything moved before it. A figure some token
 * had no rate for is left unsaid. Shown from no day, it is every day there
 * is.
 */
export const loadParlorPassbook = (session: BookSession, bookId: BookId, parlorName: string, from: IsoDate | undefined): Promise<Outcome<PassbookFrom<ParlorPassbookDay, Decimal | undefined>>> =>
  session.read(bookId, async (journal) => {
    const since = rangeTerm(from, undefined)
    const [entries, prices, deposited, withdrawn, moved] = await Promise.all([
      journal.ask(parlorEntriesRequest(parlorName, since)),
      journal.ask(pricesRequest("")),
      journal.ask(parlorMovedRequest(parlorName, "amt:>0", since)),
      journal.ask(parlorMovedRequest(parlorName, "amt:<0", since)),
      lastMovedBefore(journal, parlorSavingsTerm(parlorName), from),
    ])
    if (!moved.ok) return moved
    const held = moved.value === undefined ? Ok(() => ZERO) : await tokensHeldOn(journal, parlorSavingsTerm(parlorName), moved.value.through)
    if (!held.ok) return held
    const read = andThen(fromHledger(entries), (page) => mapOk(fromHledger(prices), (directives) => poolPassbooksOf(page.items, parlorName, pricePointsOf(directives), from, held.value)))
    if (!read.ok) return read
    const days = parlorDaysOf(read.value)
    const [newest, oldest] = [days[0] ?? moved.value?.through, moved.value?.through ?? days.at(-1)]
    const balances = newest === undefined || oldest === undefined ? new Map() : ((answer) => (answer.ok ? yenByDayOf(answer.value) : new Map()))(fromHledger(await journal.ask(parlorSavingsByDayRequest(parlorName, oldest, newest))))
    const inYen = (answer: Awaited<ReturnType<typeof journal.ask<"balance">>>, turned: boolean) => ((report) => (report.ok ? ((figures) => (figures.ok ? new Map([...figures.value].map(([day, yen]) => [day, turned ? negate(yen) : yen])) : undefined))(byColumn(report.value, "daily")) : undefined))(fromHledger(answer))
    return Ok({ days: parlorPassbookOf(read.value, { deposited: inYen(deposited, false), withdrawn: inYen(withdrawn, true), balances }), before: moved.value === undefined ? undefined : { ...moved.value, balance: balances.get(moved.value.through) } })
  })
