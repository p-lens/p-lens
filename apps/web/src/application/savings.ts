import type { BookId } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import { tokenCommodity } from "../core/commodity/commodity"
import { isZero, subtract, type Decimal, decimal } from "../core/decimal/decimal"
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
import { passbookOf, type PassbookDay } from "../core/report/passbook"
import { parlorDaysOf, parlorPassbookOf, type ParlorPassbookDay, type PoolPassbook } from "../core/report/parlor-passbook"
import { byColumn } from "../core/report/breakdown"
import { statisticTotalOf } from "../core/report/figures"
import { readSavingsAccount } from "../core/journal/accounts"
import { negate } from "../core/decimal/decimal"
import type { Transaction } from "../hledger/protocol/wire"
import { compare } from "../core/decimal/decimal"
import { openingBalanceRequest, parlorEntriesRequest, parlorMovedRequest, poolEntriesRequest, pricesRequest, savingsValueRequest } from "../hledger/query/requests"
import { savingsAccount } from "../core/journal/accounts"
import { parlorSavingsTerm, untilTerm } from "../hledger/query/terms"
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

/** A pool's passbook: its days, newest first, read from the entries that post to it and the book's prices. */
export const loadPassbook = (session: BookSession, bookId: BookId, parlorName: string, pool: SavingsPool): Promise<Outcome<readonly PassbookDay[]>> =>
  session.read(bookId, async (journal) => {
    const account = savingsAccount(pool.kind, parlorName, pool.tier)
    const [entries, prices] = await Promise.all([journal.ask(poolEntriesRequest(account)), journal.ask(pricesRequest(""))])
    return andThen(fromHledger(entries), (page) => mapOk(fromHledger(prices), (directives) => passbookOf(page.items, account, tokenCommodity(pool.kind, parlorName, pool.tier), pricePointsOf(directives))))
  })

/** The pools a parlor's entries move, each once, balls before medals and each by its account's name. */
const poolsMovedIn = (entries: readonly Transaction[], parlorName: string): readonly SavingsPool[] =>
  [...new Set(entries.flatMap((entry) => entry.tpostings.map((posting) => posting.paccount)))]
    .sort()
    .flatMap((account) => ((read) => (read !== undefined && read.parlorName === parlorName ? [{ kind: read.kind, tier: read.tier }] : []))(readSavingsAccount(account)))
    .sort((left, right) => (left.kind === right.kind ? 0 : left.kind === "ball" ? -1 : 1))

/** Each of a parlor's pools as its own passbook, from the parlor's entries: an entry belongs to a pool where it posts to its account. */
const poolPassbooksOf = (entries: readonly Transaction[], parlorName: string, prices: Parameters<typeof passbookOf>[3]): readonly PoolPassbook[] =>
  poolsMovedIn(entries, parlorName).map((pool) => {
    const account = savingsAccount(pool.kind, parlorName, pool.tier)
    return { pool, days: passbookOf(entries.filter((entry) => entry.tpostings.some((posting) => posting.paccount === account)), account, tokenCommodity(pool.kind, parlorName, pool.tier), prices) }
  })

/**
 * A parlor's passbook: every pool's days together, newest first, valued in
 * yen by hledger — what came in and went out at each day's rate, and what
 * was held at each day's end at the rate in force then, one question a
 * day. A figure some token had no rate for is left unsaid.
 */
export const loadParlorPassbook = (session: BookSession, bookId: BookId, parlorName: string): Promise<Outcome<readonly ParlorPassbookDay[]>> =>
  session.read(bookId, async (journal) => {
    const [entries, prices, deposited, withdrawn] = await Promise.all([journal.ask(parlorEntriesRequest(parlorName)), journal.ask(pricesRequest("")), journal.ask(parlorMovedRequest(parlorName, "amt:>0")), journal.ask(parlorMovedRequest(parlorName, "amt:<0"))])
    const read = andThen(fromHledger(entries), (page) => mapOk(fromHledger(prices), (directives) => poolPassbooksOf(page.items, parlorName, pricePointsOf(directives))))
    if (!read.ok) return read
    const days = parlorDaysOf(read.value)
    const balances = await Promise.all(days.map(async (date) => [date, ((answer) => (answer.ok ? ((total) => (total.ok ? total.value : undefined))(statisticTotalOf(answer.value)) : undefined))(fromHledger(await journal.ask(savingsValueRequest(untilTerm(date), parlorSavingsTerm(parlorName)))))] as const))
    const inYen = (answer: Awaited<ReturnType<typeof journal.ask<"balance">>>, turned: boolean) => ((report) => (report.ok ? ((figures) => (figures.ok ? new Map([...figures.value].map(([day, yen]) => [day, turned ? negate(yen) : yen])) : undefined))(byColumn(report.value, "daily")) : undefined))(fromHledger(answer))
    return Ok(parlorPassbookOf(read.value, { deposited: inYen(deposited, false), withdrawn: inYen(withdrawn, true), balances: new Map(balances) }))
  })
