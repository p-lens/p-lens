import { beforeAll, describe, expect, test } from "bun:test"

import { createBookSession, type BookSession } from "../../../src/application/book-session"
import { loadBreakdown } from "../../../src/application/breakdown"
import type { BookId } from "../../../src/core/book/book"
import type { IsoMonth } from "../../../src/core/calendar/calendar"
import { toPlainString } from "../../../src/core/decimal/decimal"
import { totalOf } from "../../../src/core/report/breakdown"
import { createMemoryHistory } from "../../../src/history/adapters/memory-history"
import { byDay, monthQuery, weeksOf } from "../../../src/ui/features/result-calendar/month"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../../support/in-process"

const BOOK = "basic-play" as BookId

describe("the result calendar's figures, asked of the real hledger module", () => {
  const context: { session?: BookSession } = {}
  const session = (): BookSession => context.session as BookSession
  const groups = async (by: "day" | "month", month: string) => ((found) => (found.ok ? found.value : []))(await loadBreakdown(session(), BOOK, by, monthQuery(month as IsoMonth)))
  const shown = async (month: string) => {
    const days = byDay(await groups("day", month))
    return weeksOf(month as IsoMonth).flat().flatMap((cell) => ((figures) => (cell === undefined || figures === undefined ? [] : [[cell, toPlainString(figures.actual), toPlainString(figures.theoretical)]]))(cell === undefined ? undefined : days.get(cell)))
  }
  const whole = async (month: string) => ((total) => [toPlainString(total.actual), toPlainString(total.theoretical)])(totalOf(await groups("month", month)))

  beforeAll(async () => {
    const storage = memoryStorage()
    context.session = createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
    await session().createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  })

  test("put each day's figures in that day's cell, and no day of another month", async () => {
    expect(await shown("2026-10")).toEqual([["2026-10-01", "0", "1800"], ["2026-10-03", "-1998", "900"]])
    expect(await shown("2026-09")).toEqual([["2026-09-05", "5136", "5500"], ["2026-09-12", "20030", "1800"], ["2026-09-20", "15976", "3200"]])
  })

  test("leave no day hledger answered without a cell", async () => {
    const answered = (await groups("day", "2026-09")).map((group) => group.key)
    const cells = weeksOf("2026-09" as IsoMonth).flat()
    expect(answered.filter((day) => !cells.includes(day as never))).toEqual([])
  })

  test("head the month with hledger's own figures for it, which its days come to", async () => {
    expect(await whole("2026-10")).toEqual(["-1998", "2700"])
    expect(await whole("2026-09")).toEqual(["41142", "10500"])
    expect(((total) => [toPlainString(total.actual), toPlainString(total.theoretical)])(totalOf(await groups("day", "2026-09")))).toEqual(await whole("2026-09"))
  })

  test("are nothing for a month with no plays", async () => {
    expect(await shown("2026-08")).toEqual([])
    expect(await whole("2026-08")).toEqual(["0", "0"])
  })
})
