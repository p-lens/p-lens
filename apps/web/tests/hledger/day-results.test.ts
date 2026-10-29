import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { recordDayResults } from "../../src/application/day-results"
import { loadOverview } from "../../src/application/overview"
import { loadTallies } from "../../src/application/tallies"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { decimal, toPlainString } from "../../src/core/decimal/decimal"
import type { PlayId } from "../../src/core/play/play"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { saidIn } from "../support/values"

const BOOK = "day-results" as BookId

const yen = (amount: number) => decimal(BigInt(amount), 0)

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-09T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  return { session, history }
}

describe("days' 収支 typed in a month at a time", () => {
  test("are a tally a day, in one commit, which hledger counts in their days' results and the month's", async () => {
    const { session, history } = await setUp()
    const ids = ["day-1", "day-2", "day-3"].values()
    const written = await recordDayResults(
      session,
      BOOK,
      [
        { date: "2019-03-01" as IsoDate, result: yen(-12000) },
        { date: "2019-03-02" as IsoDate, result: yen(8500) },
        { date: "2020-01-05" as IsoDate, result: yen(-3000) },
      ],
      () => ids.next().value as PlayId,
    )
    expect(written.ok).toBe(true)
    const march = await loadOverview(session, BOOK, "date:2019-03")
    expect(march.ok && toPlainString(march.value.actual)).toBe("-3500")
    const tallies = await loadTallies(session, BOOK, "date:2019", 0)
    expect(tallies.ok && tallies.value.tallies.map((tally) => [tally.id, tally.date, tally.description, tally.gameKind, tally.machine])).toEqual([
      ["day-2", "2019-03-02", "| まとめて入力", undefined, undefined],
      ["day-1", "2019-03-01", "| まとめて入力", undefined, undefined],
    ] as never)
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => [line.did, saidIn(line.parts)]).at(-1)).toEqual(["days-entered", { entered: { count: 3 } }])
  })
})
