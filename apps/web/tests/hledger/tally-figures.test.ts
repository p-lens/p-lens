import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { loadTally } from "../../src/application/tallies"
import type { BookId } from "../../src/core/book/book"
import { decimal } from "../../src/core/decimal/decimal"
import type { PlayId } from "../../src/core/play/play"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage, FIXTURE_TRANSACTIONS } from "../support/in-process"

const BOOK = "figures" as BookId

/** The fixture's first tally, told as a pachinko play followed live with a formula would be. */
const followed = (text: string): string =>
  text.replace("cabinet-number: 123\n", "cabinet-number: 123, net-regular-spins: 1100, net-jackpots: 3, spin-performance: 18.5, real-border: 17.2\n")

const opened = async () => {
  const session = createBookSession({ hledger: await inProcessHledger(), storage: memoryStorage(), history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  const book = await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] })
  await session.createBook({ ...book, files: { ...book.files, [FIXTURE_TRANSACTIONS]: followed(book.files[FIXTURE_TRANSACTIONS] ?? "") } })
  return session
}

describe("a tally's own figures, asked of the real hledger module", () => {
  test("cash spent as hledger sums it, its log's counts, its spin performance and border, a spin's worth and its time", async () => {
    const found = await loadTally(await opened(), BOOK, "made-up-0905" as PlayId)
    if (!found.ok) throw new Error("the tally should load")
    expect(found.value.figures).toEqual({
      cash: decimal(12000n, 0),
      savingsDrawn: decimal(0n, 0),
      netCounts: { type: "pachinko", spins: undefined, regularSpins: 1100, jackpots: 3 },
      spinPerformance: decimal(185n, 1),
      realBorder: decimal(172n, 1),
      theoreticalPerSpin: decimal(5n, 0),
      playSeconds: decimal(10800n, 0),
    })
  })

  test("balls drawn from savings as hledger sums them, with no cash and nothing the log counted", async () => {
    const found = await loadTally(await opened(), BOOK, "made-up-1001" as PlayId)
    if (!found.ok) throw new Error("the tally should load")
    expect(found.value.figures.cash).toEqual(decimal(0n, 0))
    expect(found.value.figures.savingsDrawn).toEqual(decimal(4000n, 0))
    expect(found.value.figures.netCounts).toBeUndefined()
    expect(found.value.figures.theoreticalPerSpin).toBeUndefined()
  })
})
