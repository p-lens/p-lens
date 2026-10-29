import { beforeAll, describe, expect, test } from "bun:test"

import { createBookSession, type BookSession } from "../../src/application/book-session"
import { loadHoldings } from "../../src/application/holdings"
import { loadOverview } from "../../src/application/overview"
import { loadTally } from "../../src/application/tallies"
import type { BookId } from "../../src/core/book/book"
import { toPlainString } from "../../src/core/decimal/decimal"
import type { PlayId } from "../../src/core/play/play"
import type { Holdings } from "../../src/core/report/holdings"
import { mapOk } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage, readExpected } from "../support/in-process"

interface Expected {
  readonly overview: Readonly<Record<string, { actual: string; theoretical: string }>>
  readonly savings: { readonly value: string; readonly valuedOn: string }
  readonly holdings: Readonly<Record<string, unknown>>
  readonly tallies: Readonly<Record<string, { actual: string; theoretical: string }>>
}

const BOOK = "basic-play" as BookId

const plainHoldings = (holdings: Holdings) => ({
  valuedOn: holdings.valuedOn,
  total: toPlainString(holdings.total),
  parlors: holdings.parlors.map((parlor) => ({
    parlor: parlor.parlorName,
    value: toPlainString(parlor.value),
    tokens: parlor.tokens.map((token) => ({
      commodity: token.commodity,
      quantity: toPlainString(token.quantity),
      rate: token.rate === undefined ? undefined : toPlainString(token.rate.rate),
      value: toPlainString(token.value),
    })),
  })),
})

describe("the basic-play book, read by the real hledger module", () => {
  const context: { session?: BookSession; expected?: Expected } = {}
  const session = (): BookSession => context.session as BookSession
  const expected = (): Expected => context.expected as Expected

  beforeAll(async () => {
    const storage = memoryStorage()
    await storage.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
    context.session = createBookSession({
      hledger: await inProcessHledger(),
      storage,
      history: createMemoryHistory(() => crypto.randomUUID()),
      clock: () => new Date("2026-10-03T12:00:00+09:00"),
      newId: () => crypto.randomUUID(), member: ME,
    })
    context.expected = (await readExpected("basic-play")) as Expected
  })

  test("actual and theoretical for each period", async () => {
    const periods = Object.entries(expected().overview)
    const figures = await Promise.all(
      periods.map(([query]) =>
        loadOverview(session(), BOOK, query).then((overview) =>
          mapOk(overview, (found) => ({
            actual: toPlainString(found.actual),
            theoretical: toPlainString(found.theoretical),
          })),
        ),
      ),
    )
    expect(Object.fromEntries(periods.map(([query], index) => [query, figures[index]]))).toEqual(
      Object.fromEntries(periods.map(([query, figure]) => [query, { ok: true, value: figure }])),
    )
  })

  test("savings are valued at the latest rate, whatever period the overview shows", async () => {
    const overview = await loadOverview(session(), BOOK, "date:2026-09")
    expect(mapOk(overview, (found) => ({ value: toPlainString(found.savings), valuedOn: String(found.savingsValuedOn) }))).toEqual({
      ok: true,
      value: expected().savings,
    })
  })

  test("holdings now and as they stood before a rate changed", async () => {
    const queries = Object.keys(expected().holdings)
    const found = await Promise.all(queries.map((query) => loadHoldings(session(), BOOK, query).then((held) => mapOk(held, plainHoldings))))
    expect(Object.fromEntries(queries.map((query, index) => [query, found[index]]))).toEqual(
      Object.fromEntries(Object.entries(expected().holdings).map(([query, held]) => [query, { ok: true, value: held }])) as never,
    )
  })

  test("one tally's result against its theoretical value", async () => {
    const [id, figure] = Object.entries(expected().tallies)[0] ?? []
    const tally = await loadTally(session(), BOOK, id as PlayId)
    expect(
      mapOk(tally, (found) => ({ actual: toPlainString(found.actual), theoretical: toPlainString(found.theoretical) })),
    ).toEqual({ ok: true, value: figure as never })
  })

  test("one tally's two sides: what went in, rental spread included, and what came out, in yen at its day", async () => {
    const tally = await loadTally(session(), BOOK, "made-up-0905" as PlayId)
    expect(mapOk(tally, (found) => ({ spent: toPlainString(found.sides.spent), won: toPlainString(found.sides.won) }))).toEqual({ ok: true, value: { spent: "12000", won: "17136" } })
  })

  test("a tally that is not in the book is missing, not an error of hledger's", async () => {
    expect(await loadTally(session(), BOOK, "no-such-play" as PlayId)).toEqual({ ok: false, error: { type: "tally-missing" } })
  })
})
