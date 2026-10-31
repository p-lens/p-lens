import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { invitationsOf, invite, type InvitationPorts } from "../../src/application/invitations"
import { renewSync, type RenewSyncPorts } from "../../src/application/renew-sync"
import { stopSync } from "../../src/application/stop-sync"
import { joinSync, startSync, syncBook, type SyncPorts } from "../../src/application/sync"
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

const BOOK = "renewed" as BookId
const RELAY_URL = "https://relay.test"
const TITLE = "軍団"

const entry = (date: string, yen: number, note: string): string => `${date} ${note}\n    資産:現金                        -${yen} JPY\n    費用:貸玉差額                    ${yen} JPY`

/** A device of its own, with everything making a book's line anew reaches. */
const device = async (name: string, relay: Relay) => {
  const storage = memoryStorage()
  const ids = { next: 0 }
  const fresh = () => `${name}-commit-${String((ids.next += 1)).padStart(6, "0")}`
  const history = createMemoryHistory(fresh)
  const member = "local" as MemberId
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-30T12:00:00+09:00"), newId: () => crypto.randomUUID(), member })
  const links = memoryLinks()
  const sealer = createWebCryptoSealer()
  const sync: SyncPorts = { session, history, links, relay, sealer, me: { id: member, displayName: name, role: "owner" }, now: () => "2026-10-30T03:00:00.000Z", newCommitId: fresh }
  const grants = { next: 0 }
  const inviting: InvitationPorts = { links, relay, sealer, invitations: memoryInvitations(), now: () => "2026-10-30T03:00:00.000Z", newId: () => `${name}-grant-${String((grants.next += 1)).padStart(8, "0")}` }
  const follow = memoryFollow()
  const renewing: RenewSyncPorts = { sync, invitations: inviting, follow }
  const record = (date: string, yen: number, note: string) =>
    session.write(BOOK, async (_journal, stored) =>
      Ok({
        files: { ...stored.files, [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", entry(date, yen, note)) },
        intent: { type: "pool-opened", parlor: note, tier: "4円", date: "2026-10-01" as IsoDate, rate: dec("4") },
      }),
    )
  const transactions = (): string => storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
  return { sync, inviting, renewing, session, history, record, transactions, stopping: { links, history, invitations: inviting.invitations, follow }, files: () => storage.peek(BOOK)?.files }
}

/** A book synced from a first device, and joined on a second and on a third that will be left behind. */
const threeDevices = async () => {
  const relay = memoryRelay()
  const first = await device("first", relay)
  await first.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [first.sync.me] }))
  const code = await startSync(first.sync, BOOK, RELAY_URL)
  await syncBook(first.sync, BOOK)
  const second = await device("second", relay)
  const lost = await device("lost", relay)
  await joinSync(second.sync, code.ok ? code.value : "", RELAY_URL)
  await joinSync(lost.sync, code.ok ? code.value : "", RELAY_URL)
  return { relay, first, second, lost, code: code.ok ? code.value : "" }
}

describe("making a book's line anew", () => {
  test("leaves behind the device that had the old code, while another of the owner's moves onto the new one with what it wrote meanwhile", async () => {
    const { first, second, lost, code } = await threeDevices()
    const renewed = await renewSync(first.renewing, BOOK, TITLE)
    expect(renewed.ok && renewed.value !== code).toBe(true)
    expect(await startSync(first.sync, BOOK, RELAY_URL)).toEqual(renewed)

    await first.record("2026-10-03", 3000, "after renewing")
    await second.record("2026-10-04", 4000, "second meanwhile")
    expect((await syncBook(first.sync, BOOK)).ok).toBe(true)
    expect((await syncBook(second.sync, BOOK)).ok).toBe(true)
    expect((await syncBook(lost.sync, BOOK)).ok).toBe(true)
    expect(lost.transactions().includes("after renewing")).toBe(false)
    expect(first.transactions().includes("second meanwhile")).toBe(false)

    expect(await joinSync(second.sync, renewed.ok ? renewed.value : "", RELAY_URL)).toEqual({ ok: true, value: BOOK })
    expect((await syncBook(second.sync, BOOK)).ok).toBe(true)
    expect((await syncBook(first.sync, BOOK)).ok).toBe(true)
    expect(first.transactions().includes("second meanwhile")).toBe(true)
    expect(second.files()).toEqual(first.files())
    expect(await joinSync(second.sync, renewed.ok ? renewed.value : "", RELAY_URL)).toEqual({ ok: false, error: { type: "sync", problem: { type: "book-here", bookId: BOOK } } })

    await first.record("2026-10-05", 5000, "after moving")
    expect((await syncBook(first.sync, BOOK)).ok).toBe(true)
    expect((await syncBook(lost.sync, BOOK)).ok).toBe(true)
    expect(lost.transactions().includes("after moving")).toBe(false)
  })

  test("lets the people let in in again, by the same name and as the same, with new codes, the old ones opening nothing new", async () => {
    const { relay, first } = await threeDevices()
    const old = await invite(first.inviting, BOOK, TITLE, "たけし", "viewer")
    const guest = await device("guest", relay)
    await joinSync(guest.sync, old.ok ? old.value.code : "", RELAY_URL)

    expect((await renewSync(first.renewing, BOOK, TITLE)).ok).toBe(true)
    const kept = await invitationsOf(first.inviting, BOOK)
    expect(kept.ok && kept.value.map(({ name, role }) => ({ name, role }))).toEqual([{ name: "たけし", role: "viewer" }])
    expect(kept.ok && old.ok && kept.value[0]?.code !== old.value.code).toBe(true)

    await first.record("2026-10-03", 3000, "after renewing")
    expect((await syncBook(first.sync, BOOK)).ok).toBe(true)
    await syncBook(guest.sync, BOOK)
    expect(guest.transactions().includes("after renewing")).toBe(false)
    const again = await device("guest-again", relay)
    expect(await joinSync(again.sync, kept.ok ? (kept.value[0]?.code ?? "") : "", RELAY_URL)).toEqual({ ok: true, value: BOOK })
    expect(again.transactions().includes("after renewing")).toBe(true)
  })

  test("moves a device that stopped syncing back onto the line by the code, with what it wrote while stopped", async () => {
    const { first, second, code } = await threeDevices()
    await stopSync(second.stopping, BOOK)
    await second.record("2026-10-04", 4000, "written while stopped")
    expect(await joinSync(second.sync, code, RELAY_URL)).toEqual({ ok: true, value: BOOK })
    expect((await syncBook(second.sync, BOOK)).ok).toBe(true)
    expect((await syncBook(first.sync, BOOK)).ok).toBe(true)
    expect(first.transactions().includes("written while stopped")).toBe(true)
  })

  test("does not move a book put back here with no history, which is joined afresh", async () => {
    const { relay, first, code } = await threeDevices()
    const restored = await device("restored", relay)
    expect((await restored.session.adoptBook({ book: { id: BOOK, members: [restored.sync.me] }, files: first.files() ?? {} })).ok).toBe(true)
    expect(await joinSync(restored.sync, code, RELAY_URL)).toEqual({ ok: false, error: { type: "sync", problem: { type: "book-here", bookId: BOOK } } })
  })
})
