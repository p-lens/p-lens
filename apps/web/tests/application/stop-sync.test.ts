import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { stopSync } from "../../src/application/stop-sync"
import { joinSync, startSync, syncAll, syncBook, type SyncPorts } from "../../src/application/sync"
import type { BookId, MemberId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { appendEntry, BOOK_FILES } from "../../src/core/journal/layout"
import { Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import type { Relay } from "../../src/sync/port/relay"
import { createWebCryptoSealer } from "../../src/sync/web-crypto/web-crypto-sealer"
import { fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { memoryFollow } from "../support/play-line"
import { memoryInvitations, memoryLinks, memoryRelay } from "../support/sync"
import { dec } from "../support/values"

const BOOK = "shared" as BookId
const RELAY_URL = "https://relay.test"

const entry = (date: string, yen: number, note: string): string => `${date} ${note}\n    資産:現金                        -${yen} JPY\n    費用:貸玉差額                    ${yen} JPY`

/** A device of its own, with what stopping a book's syncing on it reaches. */
const device = async (name: string, relay: Relay) => {
  const storage = memoryStorage()
  const ids = { next: 0 }
  const history = createMemoryHistory(() => `${name}-commit-${String((ids.next += 1)).padStart(6, "0")}`)
  const member = "local" as MemberId
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-07T12:00:00+09:00"), newId: () => crypto.randomUUID(), member })
  const links = memoryLinks()
  const invitations = memoryInvitations()
  const ports: SyncPorts = {
    session,
    history,
    links,
    relay,
    sealer: createWebCryptoSealer(),
    me: { id: member, displayName: name, role: "owner" },
    now: () => "2026-10-07T03:00:00.000Z",
    newCommitId: () => `${name}-baseline-000001`,
  }
  const record = (date: string, yen: number, note: string) =>
    session.write(BOOK, async (_journal, stored) =>
      Ok({
        files: { ...stored.files, [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", entry(date, yen, note)) },
        intent: { type: "pool-opened", parlor: note, tier: "4円", date: "2026-10-01" as IsoDate, rate: dec("4") },
      }),
    )
  return { ports, invitations, stopping: { links, history, invitations, follow: memoryFollow() }, record, files: () => storage.peek(BOOK)?.files }
}

const transactionsOf = (files: Readonly<Record<string, string>> | undefined): string => files?.[BOOK_FILES.transactions] ?? ""

describe("stopping a book's syncing on one device", () => {
  test("keeps the book as it stands, and takes in and sends nothing more, while the other device goes on", async () => {
    const relay = memoryRelay()
    const first = await device("first", relay)
    await first.ports.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [first.ports.me] }))
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    await syncBook(first.ports, BOOK)
    const second = await device("second", relay)
    await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)
    await second.invitations.write({ id: "grant-1", bookId: BOOK, name: "仲間", role: "viewer", invitedAt: "2026-10-07T03:00:00.000Z", code: "kept-code" })

    expect(await stopSync(second.stopping, BOOK)).toEqual({ ok: true, value: undefined })
    expect(await second.ports.links.read(BOOK)).toEqual({ ok: true, value: undefined })
    expect(await second.invitations.list(BOOK)).toEqual({ ok: true, value: [] })
    expect(transactionsOf(second.files())).toBe(transactionsOf(first.files()))

    await first.record("2026-10-03", 3000, "first's after")
    await second.record("2026-10-03", 4000, "second's after")
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 1 } })
    expect((await syncAll(second.ports)).through).toEqual([])
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 0 } })
    expect(transactionsOf(second.files()).includes("first's after")).toBe(false)
    expect(transactionsOf(first.files()).includes("second's after")).toBe(false)
  })

  test("counts none of the book's commits as on a line, so syncing it again begins a line from the whole of them", async () => {
    const relay = memoryRelay()
    const first = await device("first", relay)
    await first.ports.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [first.ports.me] }))
    await first.record("2026-10-01", 1000, "one")
    await startSync(first.ports, BOOK, RELAY_URL)
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 2 } })

    await stopSync(first.stopping, BOOK)
    const again = await startSync(first.ports, BOOK, RELAY_URL)
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 2 } })
    const joined = await device("joined", relay)
    expect(await joinSync(joined.ports, again.ok ? again.value : "", RELAY_URL)).toEqual({ ok: true, value: BOOK })
    expect(transactionsOf(joined.files())).toBe(transactionsOf(first.files()))
  })
})
