import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { conflictOf, firstConflict, joinSync, settleConflict, startSync, syncBook, type SyncPorts } from "../../src/application/sync"
import type { BookId, MemberId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { appendEntry, BOOK_FILES } from "../../src/core/journal/layout"
import { Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import type { Relay } from "../../src/sync/port/relay"
import { createWebCryptoSealer } from "../../src/sync/web-crypto/web-crypto-sealer"
import { fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { memoryLinks, memoryRelay } from "../support/sync"
import { dec } from "../support/values"

const BOOK = "shared" as BookId
const RELAY_URL = "https://relay.test"

const entry = (date: string, yen: number, note: string): string => `${date} ${note}\n    資産:現金                        -${yen} JPY\n    費用:貸玉差額                    ${yen} JPY`

/** A device of its own: its storage, its history, its hledger, its links — and the one relay they all reach. */
const device = async (name: string, relay: Relay) => {
  const storage = memoryStorage()
  const ids = { next: 0 }
  const history = createMemoryHistory(() => `${name}-commit-${String((ids.next += 1)).padStart(6, "0")}`)
  const member = "local" as MemberId
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-07T12:00:00+09:00"), newId: () => crypto.randomUUID(), member })
  const ports: SyncPorts = {
    session,
    history,
    links: memoryLinks(),
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
  const retitle = (title: string) =>
    session.write(BOOK, async (_journal, stored) =>
      Ok({
        files: { ...stored.files, [BOOK_FILES.main]: (stored.files[BOOK_FILES.main] ?? "").replace(/book-title-p: .*/, `book-title-p: ${title}`) },
        intent: { type: "parlors-linked", names: [title] },
      }),
    )
  return { ports, session, storage, history, record, retitle, files: () => storage.peek(BOOK)?.files, ids: async () => (await history.log(BOOK)).ok && ((await history.log(BOOK)) as { value: readonly { id: string }[] }).value.map((commit) => commit.id) }
}

const withBook = async (name: string, relay: Relay) => {
  const made = await device(name, relay)
  await made.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [made.ports.me] }))
  return made
}

describe("a book on two devices", () => {
  test("is joined from its pairing code, whole, with its history", async () => {
    const relay = memoryRelay()
    const first = await withBook("first", relay)
    await first.record("2026-10-01", 1000, "one")
    await first.record("2026-10-02", 2000, "two")
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    expect(code.ok && /^[A-Za-z0-9_-]{43}$/.test(code.value)).toBe(true)
    expect(await joinSync(await device("nowhere", relay).then((made) => made.ports), code.ok ? code.value : "", undefined)).toEqual({ ok: false, error: { type: "sync", problem: { type: "no-relay" } } })
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 3 } })

    const second = await device("second", relay)
    expect(await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)).toEqual({ ok: true, value: BOOK })
    expect(second.files()).toEqual(first.files())
    expect(await second.ids()).toEqual(await first.ids())
    expect((await second.session.books()).ok).toBe(true)
    expect(await syncBook(second.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 0 } })
  })

  test("what each recorded apart comes together on both, each commit kept", async () => {
    const relay = memoryRelay()
    const first = await withBook("first", relay)
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    await syncBook(first.ports, BOOK)
    const second = await device("second", relay)
    await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)

    await first.record("2026-10-03", 3000, "first's")
    await second.record("2026-10-03", 4000, "second's")
    await second.record("2026-10-04", 5000, "second's again")
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 1 } })
    expect(await syncBook(second.ports, BOOK)).toEqual({ ok: true, value: { received: 1, sent: 2 } })
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 2, sent: 0 } })

    expect(second.files()).toEqual(first.files())
    const transactions = first.files()?.[BOOK_FILES.transactions] ?? ""
    expect(["first's", "second's", "second's again"].map((note) => transactions.includes(note))).toEqual([true, true, true])
    expect(transactions.indexOf("first's")).toBeLessThan(transactions.indexOf("second's"))
    expect(await second.ids()).toEqual(await first.ids())
    expect((await first.session.read(BOOK, async () => Ok("read"))).ok).toBe(true)
  })

  test("a line its relay let go of is made again by the device that comes back first, and met from its start by the other", async () => {
    const relay = memoryRelay()
    const first = await withBook("first", relay)
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    await syncBook(first.ports, BOOK)
    const second = await device("second", relay)
    await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)
    await second.record("2026-10-03", 4000, "second's, never taken by first")
    await syncBook(second.ports, BOOK)
    const whole = relay.kept().length

    relay.letGo()
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: whole - 1 } })
    await first.record("2026-10-04", 3000, "first's, after the line was made again")
    await syncBook(first.ports, BOOK)
    expect(await syncBook(second.ports, BOOK)).toEqual({ ok: true, value: { received: whole, sent: 1 } })
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 1, sent: 0 } })

    expect(second.files()).toEqual(first.files())
    expect(await second.ids()).toEqual(await first.ids())
    const transactions = first.files()?.[BOOK_FILES.transactions] ?? ""
    expect(["never taken by first", "after the line was made again"].map((note) => transactions.includes(note))).toEqual([true, true])
    const third = await device("third", relay)
    expect((await joinSync(third.ports, code.ok ? code.value : "", RELAY_URL)).ok).toBe(true)
    expect(third.files()).toEqual(first.files())
  })

  test("the same line rewritten on both is a conflict, and neither book is touched", async () => {
    const relay = memoryRelay()
    const first = await withBook("first", relay)
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    await syncBook(first.ports, BOOK)
    const second = await device("second", relay)
    await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)

    await first.retitle("first's title")
    await second.retitle("second's title")
    await syncBook(first.ports, BOOK)
    const before = second.files()
    expect(await syncBook(second.ports, BOOK)).toEqual({ ok: false, error: { type: "sync", problem: { type: "conflict", path: BOOK_FILES.main } } })
    expect(second.files()).toEqual(before)
    expect((await second.history.unsent(BOOK)).ok && ((await second.history.unsent(BOOK)) as { value: readonly unknown[] }).value.length).toBe(1)
  })

  test("a conflict is laid out for a choice, settled by the sides picked, and comes out the same on both", async () => {
    const relay = memoryRelay()
    const first = await withBook("first", relay)
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    await syncBook(first.ports, BOOK)
    const second = await device("second", relay)
    await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)

    await first.retitle("first's title")
    await first.record("2026-10-06", 7000, "first's play")
    await second.retitle("second's title")
    await second.record("2026-10-06", 8000, "second's play")
    await syncBook(first.ports, BOOK)
    expect((await syncBook(second.ports, BOOK)).ok).toBe(false)
    expect(await conflictOf(first.ports, BOOK)).toEqual({ ok: true, value: undefined })

    const found = await firstConflict(second.ports)
    const conflict = found.ok ? found.value : undefined
    expect(conflict?.files.map((file) => file.path)).toEqual([BOOK_FILES.main])
    expect(conflict?.files[0]?.parts.filter((part) => part.type === "contested")).toEqual([
      { type: "contested", ours: ["; book-title-p: second's title"], theirs: ["; book-title-p: first's title"] },
    ])
    if (conflict === undefined) throw new Error("no conflict found")

    expect(await settleConflict(second.ports, conflict, { [BOOK_FILES.main]: [] })).toEqual({ ok: false, error: { type: "sync", problem: { type: "unsettled" } } })
    expect(await settleConflict(second.ports, conflict, { [BOOK_FILES.main]: ["ours"] })).toEqual({ ok: true, value: undefined })
    expect(second.files()?.[BOOK_FILES.main]).toContain("second's title")
    expect(["first's play", "second's play"].map((note) => (second.files()?.[BOOK_FILES.transactions] ?? "").includes(note))).toEqual([true, true])

    expect((await syncBook(second.ports, BOOK)).ok).toBe(true)
    expect((await syncBook(first.ports, BOOK)).ok).toBe(true)
    expect(first.files()).toEqual(second.files())
    expect(await first.ids()).toEqual(await second.ids())
    expect(await conflictOf(second.ports, BOOK)).toEqual({ ok: true, value: undefined })
  })

  test("settled for the other device's side, nothing of this one's conflicting line is kept, and the rest of it is", async () => {
    const relay = memoryRelay()
    const first = await withBook("first", relay)
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    await syncBook(first.ports, BOOK)
    const second = await device("second", relay)
    await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)
    await first.retitle("first's title")
    await second.retitle("second's title")
    await second.record("2026-10-06", 8000, "second's play")
    await syncBook(first.ports, BOOK)
    const found = await conflictOf(second.ports, BOOK)
    if (!found.ok || found.value === undefined) throw new Error("no conflict found")
    expect((await settleConflict(second.ports, found.value, { [BOOK_FILES.main]: ["theirs"] })).ok).toBe(true)
    await syncBook(second.ports, BOOK)
    await syncBook(first.ports, BOOK)
    expect(first.files()?.[BOOK_FILES.main]).toContain("first's title")
    expect(first.files()?.[BOOK_FILES.transactions]).toContain("second's play")
    expect(first.files()).toEqual(second.files())
  })

  test("a book older than its history starts its line with what it already held", async () => {
    const relay = memoryRelay()
    const first = await device("first", relay)
    await first.storage.createBook(await fixtureBook("basic-play", { id: BOOK, members: [first.ports.me] }))
    await first.record("2026-10-05", 6000, "after history began")
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    expect(await syncBook(first.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 2 } })
    const second = await device("second", relay)
    expect((await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)).ok).toBe(true)
    expect(second.files()).toEqual(first.files())
  })

  test("nothing the relay is given can be read there", async () => {
    const relay = memoryRelay()
    const first = await withBook("first", relay)
    await startSync(first.ports, BOOK, RELAY_URL)
    await syncBook(first.ports, BOOK)
    const kept = JSON.stringify(relay.kept())
    expect(relay.kept().length).toBe(1)
    expect(["ホシゾラ", "資産", "transactions.journal", "book-created", BOOK].some((word) => kept.includes(word))).toBe(false)
  })

  test("a code that is none, or one whose line has nothing yet, joins nothing", async () => {
    const relay = memoryRelay()
    const second = await device("second", relay)
    expect(await joinSync(second.ports, "hello", RELAY_URL)).toEqual({ ok: false, error: { type: "sync", problem: { type: "not-a-pairing-code" } } })
    const first = await withBook("first", relay)
    const code = await startSync(first.ports, BOOK, RELAY_URL)
    expect(await joinSync(second.ports, code.ok ? code.value : "", RELAY_URL)).toEqual({ ok: false, error: { type: "sync", problem: { type: "nothing-to-join" } } })
    await syncBook(first.ports, BOOK)
    expect(await joinSync(first.ports, code.ok ? code.value : "", RELAY_URL)).toEqual({ ok: false, error: { type: "sync", problem: { type: "book-here", bookId: BOOK } } })
  })
})
