import type { BalanceReport, PriceDirective, ReportRow } from "../../hledger/protocol/wire"
import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { tokenCommodity, type TokenKind } from "../commodity/commodity"
import { add, compare, sum, ZERO, type Decimal } from "../decimal/decimal"
import { readSavingsAccount } from "../journal/accounts"
import { identityKey, type Parlor } from "../parlor/parlor"
import { Ok, andThen, collect, mapOk, type Result } from "../result/result"
import { latestRate, rateOn, type PricePoint } from "../valuation/valuation"
import { decimalOfQuantity, lastDayOf, quantityIn, yenOf, type ReportError } from "./figures"

export interface TokenHolding {
  readonly kind: TokenKind
  /** The rental rate these savings are kept at, e.g. `4円`. */
  readonly tier: string
  readonly commodity: string
  readonly quantity: Decimal
  /** What hledger valued the savings at, at the rate in force on `valuedOn`. */
  readonly value: Decimal
  /** The rate that valuation used, as the price directives state it. */
  readonly rate: PricePoint | undefined
}

export interface ParlorHolding {
  readonly parlorName: string
  readonly parlor: Parlor | undefined
  readonly tokens: readonly TokenHolding[]
  /** The sum of `tokens`' values: hledger's figures added, nothing revalued. */
  readonly value: Decimal
}

export interface Holdings {
  readonly parlors: readonly ParlorHolding[]
  /** hledger's own total over every parlor. */
  readonly total: Decimal
  readonly valuedOn: IsoDate | undefined
}

/** Price directives as price points; a directive with an unreadable day is dropped. */
export const pricePointsOf = (directives: readonly PriceDirective[]): readonly PricePoint[] =>
  directives.flatMap((directive) => {
    const date = parseIsoDate(directive.pddate)
    return date.ok
      ? [{ date: date.value, commodity: directive.pdcommodity, rate: decimalOfQuantity(directive.pdamount.aquantity) }]
      : []
  })

interface SavingsRow {
  readonly parlorName: string
  readonly holding: TokenHolding
}

const savingsRowOf = (
  name: string,
  quantities: BalanceReport,
  value: Decimal,
  prices: readonly PricePoint[],
  valuedOn: IsoDate | undefined,
): SavingsRow | undefined => {
  const savings = readSavingsAccount(name)
  if (savings === undefined) return undefined
  const commodity = tokenCommodity(savings.kind, savings.parlorName, savings.tier)
  const row = quantities.prRows.find((candidate) => candidate.prrName === name)
  return {
    parlorName: savings.parlorName,
    holding: {
      kind: savings.kind,
      tier: savings.tier,
      commodity,
      quantity: quantityIn(row?.prrTotal ?? [], commodity),
      value,
      rate: valuedOn === undefined ? latestRate(prices, commodity) : rateOn(prices, commodity, valuedOn),
    },
  }
}

const groupByParlor = (rows: readonly SavingsRow[], parlors: readonly Parlor[]): readonly ParlorHolding[] =>
  [...new Set(rows.map((row) => row.parlorName))].map((parlorName) => {
    const tokens = rows.filter((row) => row.parlorName === parlorName).map((row) => row.holding)
    return {
      parlorName,
      parlor: parlors.find((parlor) => parlor.name === parlorName),
      tokens,
      value: sum(tokens.map((token) => token.value)),
    }
  })

const valuedRowOf = (
  row: ReportRow,
  quantities: BalanceReport,
  prices: readonly PricePoint[],
  valuedOn: IsoDate | undefined,
): Result<SavingsRow | undefined, ReportError> => {
  const name = row.prrName
  return typeof name === "string"
    ? mapOk(yenOf(row.prrTotal), (value) => savingsRowOf(name, quantities, value, prices, valuedOn))
    : Ok(undefined)
}

/**
 * The pools a book has opened that a balance report says nothing of,
 * because nothing is held there: each as a row of none. A pool shown is a
 * pool whose count can be put right, so one that stands at zero is shown.
 */
const emptyRowsOf = (parlors: readonly Parlor[], found: readonly SavingsRow[], prices: readonly PricePoint[], valuedOn: IsoDate | undefined): readonly SavingsRow[] =>
  parlors.flatMap((parlor) =>
    parlor.pools.flatMap((pool) => {
      const commodity = tokenCommodity(pool.kind, parlor.name, pool.tier)
      return found.some((row) => row.holding.commodity === commodity)
        ? []
        : [
            {
              parlorName: parlor.name,
              holding: { kind: pool.kind, tier: pool.tier, commodity, quantity: ZERO, value: ZERO, rate: valuedOn === undefined ? latestRate(prices, commodity) : rateOn(prices, commodity, valuedOn) },
            },
          ]
    }),
  )

const isSavingsRow = (row: SavingsRow | undefined): row is SavingsRow => row !== undefined

/**
 * Savings per parlor, read off two hledger balance reports over the same
 * accounts and period: one in tokens, one valued in yen at the period's end.
 * A pool the book has opened and holds nothing in is there too, at none.
 */
export const holdingsOf = (
  quantities: BalanceReport,
  values: BalanceReport,
  directives: readonly PriceDirective[],
  parlors: readonly Parlor[],
): Result<Holdings, ReportError> => {
  const valuedOn = lastDayOf(values)
  const prices = pricePointsOf(directives)
  const rows = collect(values.prRows.map((row) => valuedRowOf(row, quantities, prices, valuedOn)))
  return andThen(rows, (found) => {
    const held = found.filter(isSavingsRow)
    return mapOk(yenOf(values.prTotals.prrTotal), (total) => ({
      parlors: groupByParlor([...held, ...emptyRowsOf(parlors, held, prices, valuedOn)], parlors),
      total,
      valuedOn,
    }))
  })
}

/** What several books' savings come to together: each book's own total, hledger's, added — nothing valued again across books. */
export const totalAcross = (books: readonly Holdings[]): Decimal => sum(books.map((book) => book.total))

/** The latest day any of several books' savings are valued on: the day a valuation of them all together is said to be of. */
export const latestValuedOn = (books: readonly Holdings[]): IsoDate | undefined => books.flatMap((book) => (book.valuedOn === undefined ? [] : [book.valuedOn])).toSorted().at(-1)

/** One pool's savings over several books: the tokens each holds added, what each valued them at added, and every rate they were valued at, lowest first. */
export interface PoolAcross {
  readonly kind: TokenKind
  readonly tier: string
  readonly quantity: Decimal
  readonly value: Decimal
  readonly rates: readonly Decimal[]
}

/** One parlor's savings over several books: its pools, what they are worth added, and how many of the books keep savings there. */
export interface ParlorAcross {
  readonly parlorName: string
  readonly pools: readonly PoolAcross[]
  readonly value: Decimal
  readonly books: number
}

/** A parlor as one across books: the list's, or a submission's, by its identity, and one a book keeps by name alone by that name. */
const parlorKeyOf = (holding: ParlorHolding): string => (holding.parlor === undefined ? `name:${holding.parlorName}` : identityKey(holding.parlor.identity))

const withRate = (rates: readonly Decimal[], rate: PricePoint | undefined): readonly Decimal[] =>
  rate === undefined || rates.some((kept) => compare(kept, rate.rate) === 0) ? rates : [...rates, rate.rate].toSorted(compare)

const poolsWith = (pools: readonly PoolAcross[], token: TokenHolding): readonly PoolAcross[] => {
  const found = pools.find((pool) => pool.kind === token.kind && pool.tier === token.tier)
  if (found === undefined) return [...pools, { kind: token.kind, tier: token.tier, quantity: token.quantity, value: token.value, rates: withRate([], token.rate) }]
  return pools.map((pool) => (pool === found ? { ...pool, quantity: add(pool.quantity, token.quantity), value: add(pool.value, token.value), rates: withRate(pool.rates, token.rate) } : pool))
}

/**
 * Several books' savings, parlor by parlor: a parlor the books keep is one,
 * however many keep it, each pool's tokens and the yen each book valued
 * them at added — tokens of one pool are tokens alike, and nothing is
 * valued again across books, so a pool two books value at two rates is
 * worth what each says, added, and both rates are kept. In the order the
 * parlors first come in the books.
 */
export const parlorsAcross = (books: readonly Holdings[]): readonly ParlorAcross[] => {
  const holdings = books.flatMap((book) => book.parlors)
  const keys = [...new Set(holdings.map(parlorKeyOf))]
  return keys.map((key) => {
    const ofParlor = holdings.filter((holding) => parlorKeyOf(holding) === key)
    return {
      parlorName: ofParlor[0]?.parlorName ?? "",
      pools: ofParlor.flatMap((holding) => holding.tokens).reduce(poolsWith, []),
      value: sum(ofParlor.map((holding) => holding.value)),
      books: ofParlor.length,
    }
  })
}
