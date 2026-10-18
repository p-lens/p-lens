import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { loadDaysAndWhole, loadSenderBreakdown } from "../../src/application/breakdown"
import { loadHoldings } from "../../src/application/holdings"
import { recordTokenTally } from "../../src/application/record-tally"
import { registerOpeningBalance } from "../../src/application/savings"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString, type Decimal } from "../../src/core/decimal/decimal"
import type { ParlorId } from "../../src/core/parlor/parlor"
import type { PlayId } from "../../src/core/play/play"
import { UNSENT } from "../../src/core/report/senders"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { RENTED_PLAY, dec } from "../support/values"

const BOOK = "mine" as BookId

const setUp = async () => {
  const session = createBookSession({ hledger: await inProcessHledger(), storage: memoryStorage(), history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  return session
}

type Session = Awaited<ReturnType<typeof setUp>>

const sent = (session: Session, id: string, date: string, sender: { readonly id: string; readonly name: string } | undefined) =>
  recordTokenTally(session, BOOK, { ...RENTED_PLAY, id: id as PlayId, date: date as IsoDate, ...(sender === undefined ? {} : { sender }) })

const OFFERED = [UNSENT, "grant-kenji", "grant-taro"]

const monthOf = async (session: Session, chosen: readonly string[] | undefined) => {
  const found = await loadDaysAndWhole(session, BOOK, "date:2026-10", { chosen, offered: OFFERED })
  return found.ok ? found.value.whole.map((group) => toPlainString(group.actual)) : found
}

const daysOf = async (session: Session, chosen: readonly string[] | undefined) => {
  const found = await loadDaysAndWhole(session, BOOK, "date:2026-10", { chosen, offered: OFFERED })
  return found.ok ? found.value.days.map((group) => group.key).toSorted() : found
}

describe("a book's calendar narrowed to who played it", () => {
  test("sums only the tallies of those chosen, hledger asked of theirs alone", async () => {
    const session = await setUp()
    await sent(session, "kenji-1", "2026-10-05", { id: "grant-kenji", name: "けんじ" })
    await sent(session, "kenji-2", "2026-10-07", { id: "grant-kenji", name: "けんじ" })
    await sent(session, "taro-1", "2026-10-06", { id: "grant-taro", name: "たろう" })
    await sent(session, "own-1", "2026-10-08", undefined)
    const bySender = await loadSenderBreakdown(session, BOOK, "date:2026-10")
    const actualOf = (key: string): Decimal | undefined => (bySender.ok ? bySender.value.find((group) => group.key === key)?.actual : undefined)
    const one = toPlainString(actualOf("grant-taro") ?? dec("0"))
    expect(one).not.toBe("0")
    expect(await monthOf(session, ["grant-kenji"])).toEqual([toPlainString(actualOf("grant-kenji") ?? dec("0"))])
    expect(await monthOf(session, ["grant-kenji"])).toEqual([toPlainString(dec(String(Number(one) * 2)))])
    expect(await daysOf(session, ["grant-kenji"])).toEqual(["2026-10-05", "2026-10-07"])
    expect(await daysOf(session, [UNSENT])).toEqual(["2026-10-01", "2026-10-03", "2026-10-08"])
    expect(await daysOf(session, [UNSENT, "grant-taro"])).toEqual(["2026-10-01", "2026-10-03", "2026-10-06", "2026-10-08"])
    expect(await monthOf(session, [UNSENT])).toEqual([toPlainString(actualOf("") ?? dec("0"))])
    expect(await daysOf(session, undefined)).toEqual(["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"])
    expect(await daysOf(session, [])).toEqual([])
  })
})

describe("a book's savings narrowed to some parlors", () => {
  test("are those parlors' pools alone, hledger's total over theirs", async () => {
    const session = await setUp()
    const every = await loadHoldings(session, BOOK, "")
    const parlors = every.ok ? every.value.parlors : []
    expect(parlors.length).toBeGreaterThan(1)
    const [first] = parlors
    const narrowed = await loadHoldings(session, BOOK, "", [first?.parlorName ?? ""])
    expect(narrowed.ok && narrowed.value.parlors.map((holding) => holding.parlorName)).toEqual([first?.parlorName ?? ""])
    expect(narrowed.ok && toPlainString(narrowed.value.total)).toBe(toPlainString(first?.value ?? dec("0")))
    expect(narrowed.ok && narrowed.value.valuedOn).toBe(every.ok ? every.value.valuedOn : undefined)
    const none = await loadHoldings(session, BOOK, "", [])
    expect(none.ok && none.value.parlors).toEqual([])
  })

  test("find a parlor whose name holds a space", async () => {
    const session = await setUp()
    const opening = { identity: { type: "listed", id: "osm-9" as ParlorId }, parlorName: "ホシゾラ なんば", pool: { kind: "ball", tier: "4円" }, rate: dec("4"), date: "2026-10-01" as IsoDate } as const
    expect((await registerOpeningBalance(session, BOOK, opening, dec("5000"))).ok).toBe(true)
    const narrowed = await loadHoldings(session, BOOK, "", ["ホシゾラ なんば"])
    expect(narrowed.ok && narrowed.value.parlors.map((holding) => [holding.parlorName, holding.tokens.map((token) => toPlainString(token.quantity))])).toEqual([["ホシゾラ なんば", ["5000"]]])
    expect(narrowed.ok && toPlainString(narrowed.value.total)).toBe("20000")
  })
})
