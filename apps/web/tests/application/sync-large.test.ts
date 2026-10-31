import { RELAY_LIMITS } from "@p-lens/contracts/relay"
import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { joinSync, startSync, syncBook, type SyncPorts } from "../../src/application/sync"
import type { BookId, MemberId } from "../../src/core/book/book"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import type { Relay } from "../../src/sync/port/relay"
import { createWebCryptoSealer } from "../../src/sync/web-crypto/web-crypto-sealer"
import { fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { memoryLinks, memoryRelay } from "../support/sync"

const BOOK = "large" as BookId
const RELAY_URL = "https://relay.test"

/** A device of its own, whose commits each have an id of their own. */
const device = async (name: string, relay: Relay) => {
  const storage = memoryStorage()
  const ids = { next: 0 }
  const fresh = () => `${name}-commit-${String((ids.next += 1)).padStart(6, "0")}`
  const history = createMemoryHistory(fresh)
  const member = "local" as MemberId
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-30T12:00:00+09:00"), newId: () => crypto.randomUUID(), member })
  const ports: SyncPorts = {
    session,
    history,
    links: memoryLinks(),
    relay,
    sealer: createWebCryptoSealer(),
    me: { id: member, displayName: name, role: "owner" },
    now: () => "2026-10-30T03:00:00.000Z",
    newCommitId: fresh,
  }
  return { ports, session, history, files: () => storage.peek(BOOK)?.files }
}

/** Notes enough to make a book several boxes long, as years of plays would: Japanese, three bytes a character. */
const yearsOfNotes = (lines: number): string => Array.from({ length: lines }, (_, index) => `; ${String(index).padStart(5, "0")} 三年分の稼働の覚え書き、ホールと台と出玉のこと`).join("\n")

describe("a book larger than a relay takes in one commit", () => {
  test("put back with no history, goes on its line in commits a box holds, and is joined whole", async () => {
    const relay = memoryRelay()
    const first = await device("first", relay)
    const stored = await fixtureBook("basic-play", { id: BOOK, members: [first.ports.me] })
    const transactions = `${stored.files[BOOK_FILES.transactions] ?? ""}\n${yearsOfNotes(60_000)}\n`
    expect(new TextEncoder().encode(transactions).length).toBeGreaterThan(RELAY_LIMITS.bodyBytes)
    expect(await first.session.adoptBook({ ...stored, files: { ...stored.files, [BOOK_FILES.transactions]: transactions } })).toEqual({ ok: true, value: undefined })

    const code = await startSync(first.ports, BOOK, RELAY_URL)
    const synced = await syncBook(first.ports, BOOK)
    expect(synced.ok && synced.value.sent).toBeGreaterThan(4)
    expect(relay.kept().every((entry) => entry.box.length <= RELAY_LIMITS.boxLength)).toBe(true)
    expect(relay.keeps().length).toBeGreaterThan(1)
    expect(await first.history.unsent(BOOK)).toEqual({ ok: true, value: [] })

    const second = await device("second", relay)
    expect(await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)).toEqual({ ok: true, value: BOOK })
    expect(second.files()).toEqual(first.files())
    expect(await syncBook(second.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 0 } })
  }, 60_000)
})
