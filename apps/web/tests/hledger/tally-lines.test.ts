import { describe, expect, test } from "bun:test"

import { firstBook } from "../../src/app/composition/first-book"
import { createBookSession } from "../../src/application/book-session"
import { fromHledger, fromReport } from "../../src/application/lift"
import { withAccountsFor } from "../../src/application/record-tally"
import { linesIn } from "../../src/application/tally-lines"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { renderEntry, type Entry } from "../../src/core/journal/entry"
import { withEntriesFiled } from "../../src/core/journal/filing"
import { BOOK_FILES } from "../../src/core/journal/layout"
import type { PlayId } from "../../src/core/play/play"
import { actualOf, sidesOf } from "../../src/core/report/figures"
import { tallySummariesOf } from "../../src/core/report/tallies"
import { andThen, collect, mapOk } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { actualRequest, talliesRequest } from "../../src/hledger/query/requests"
import { tallyTerm } from "../../src/hledger/query/terms"
import { madeAll, makingOf, nextDayOf, openingOf, type Making, type SampleOrder } from "../../src/sample-book/core/book"
import { drawsFrom } from "../../src/sample-book/core/draws"
import { sampleParlorsOf } from "../../src/sample-book/core/parlors"
import { ME, inProcessHledger, memoryStorage } from "../support/in-process"
import { LINEUP, PARLOR_LIST } from "../sample-book/fixtures"

const BOOK = "lines" as BookId

const FROM = "2024-01-01" as IsoDate

const THROUGH = "2024-09-30" as IsoDate

/** Nine months of the sample book's plays, every one of them a tally of its own day. */
const playedEntries = (order: SampleOrder): readonly Entry[] => {
  const held: { making: Making; entries: Entry[] } = { making: makingOf(order), entries: [] }
  while (!madeAll(held.making)) {
    const next = nextDayOf(order, held.making)
    if (!next.ok) throw new Error(JSON.stringify(next.error))
    held.making = next.value.making
    held.entries.push(...(next.value.day?.entries ?? []))
  }
  return held.entries
}

const sampleBook = () => {
  const [placing] = sampleParlorsOf(PARLOR_LIST, undefined, FROM, THROUGH, drawsFrom("lines:parlors"))
  const counter = { next: 0 }
  const order: SampleOrder = {
    from: FROM,
    through: THROUGH,
    parlors: placing.parlors,
    lineup: LINEUP,
    seed: "lines",
    playIdOn: (date) => {
      counter.next += 1
      return `lines-${date}-${String(counter.next)}` as PlayId
    },
  }
  const entries = playedEntries(order)
  const fresh = firstBook(BOOK, ME, "マイ帳簿")
  const opening = openingOf(order)
  const opened = {
    ...fresh.files,
    [BOOK_FILES.accounts]: `${(fresh.files[BOOK_FILES.accounts] ?? "").replace(/\n*$/, "\n")}${opening.declarations}`,
    [BOOK_FILES.prices]: `${fresh.files[BOOK_FILES.prices] ?? ""}${opening.prices}`,
  }
  return { ...fresh, files: withEntriesFiled(entries.reduce(withAccountsFor, opened), entries.map((entry) => ({ date: entry.date, text: renderEntry(entry) }))) }
}

describe("every tally of a book as a line", () => {
  test("comes to what asking hledger of each tally alone came to, a figure at a time, in the same order", async () => {
    const session = createBookSession({
      hledger: await inProcessHledger(),
      storage: memoryStorage(),
      history: createMemoryHistory(() => crypto.randomUUID()),
      clock: () => new Date("2024-10-01T12:00:00+09:00"),
      newId: () => crypto.randomUUID(),
      member: ME,
    })
    await session.createBook(sampleBook())
    const compared = await session.read(BOOK, async (journal) => {
      const lines = await linesIn(journal, "")
      if (!lines.ok) return lines
      const entries = fromHledger(await journal.ask(talliesRequest("", { limit: 1_000_000, offset: 0 })))
      if (!entries.ok) return entries
      const each = collect(
        await Promise.all(
          tallySummariesOf(entries.value.items).map(async (tally) =>
            andThen(fromHledger(await journal.ask(actualRequest(tallyTerm(tally.id)))), (statement) =>
              andThen(fromReport(sidesOf(statement)), (sides) => mapOk(fromReport(actualOf(statement)), (actual) => [tally.id, toPlainString(sides.spent), toPlainString(sides.won), toPlainString(actual)] as const)),
            ),
          ),
        ),
      )
      return mapOk(each, (alone) => ({ alone, together: lines.value.map((line) => [line.tally.id, toPlainString(line.sides.spent), toPlainString(line.sides.won), toPlainString(line.actual)] as const) }))
    })
    expect(compared.ok).toBe(true)
    const { alone, together } = compared.ok ? compared.value : { alone: [], together: [] }
    expect(together.length).toBeGreaterThan(200)
    expect(together.filter(([, spent, won]) => spent !== "0" && won !== "0").length).toBeGreaterThan(50)
    expect([...together]).toEqual([...alone])
  }, 120_000)
})
