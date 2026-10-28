import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { firstBook } from "../../src/app/composition/first-book"
import { keepingHistory } from "../../src/application/draft-history"
import { receiveArrivals, takeSentAgain, type InboxPorts } from "../../src/application/inbox"
import { INBOX_OPENING, invitationsOf, invite, restoreGrants, uninvite, type InvitationPorts } from "../../src/application/invitations"
import { loadOverview } from "../../src/application/overview"
import { chooseBook, finishPlay, loadDrafts, reviseCheckpoints, startPlay } from "../../src/application/live-play"
import { destinationsOf, sendDraft, type SendingPorts } from "../../src/application/sending"
import { renameBook } from "../../src/application/rename-book"
import { joinByCode, joinSync, startSync, syncBook, type SyncPorts } from "../../src/application/sync"
import { roleIn, type BookId, type MemberId } from "../../src/core/book/book"
import { appendEntry, BOOK_FILES } from "../../src/core/journal/layout"
import { Ok, mapOk } from "../../src/core/result/result"
import { readInvitation } from "../../src/core/sync/invitation"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import type { Relay } from "../../src/sync/port/relay"
import { createWebCryptoSealer } from "../../src/sync/web-crypto/web-crypto-sealer"
import { afterItFinished, isSentAsItStands, senderOf, type PlayDraft } from "../../src/core/live-play/draft"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { fixtureBook, inProcessHledger, memoryDrafts, memoryStorage } from "../support/in-process"
import { toPlainString } from "../../src/core/decimal/decimal"
import type { PlayId } from "../../src/core/play/play"
import type { Destination, DestinationStore } from "../../src/sync/port/destination-store"
import { memoryFollow } from "../support/play-line"
import { memoryInvitations, memoryLinks, memoryRelay } from "../support/sync"
import { RENTED_PLAY, MALEHAN, dec } from "../support/values"

const BOOK = "group" as BookId
const RELAY_URL = "https://relay.test"
const ME = "local" as MemberId

const RECORD = { ...RENTED_PLAY, id: "sent-1" as PlayId, date: "2026-10-09" as IsoDate }

const entry = (date: string, yen: number, note: string): string => `${date} ${note}\n    資産:現金                        -${yen} JPY\n    費用:貸玉差額                    ${yen} JPY`

/** A device of its own, a person's: its storage, its history, its links and whom it remembers letting in — and the one relay they all reach. */
const device = async (name: string, relay: Relay) => {
  const storage = memoryStorage()
  const ids = { next: 0 }
  const history = createMemoryHistory(() => `${name}-commit-${String((ids.next += 1)).padStart(6, "0")}`)
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  const links = memoryLinks()
  const sealer = createWebCryptoSealer()
  const ports: SyncPorts = { session, history, links, relay, sealer, me: { id: ME, displayName: name, role: "owner" }, now: () => "2026-10-09T03:00:00.000Z", newCommitId: () => `${name}-baseline-000001` }
  const grants = { next: 0 }
  const inviting: InvitationPorts = { links, relay, sealer, invitations: memoryInvitations(), now: () => "2026-10-09T03:00:00.000Z", newId: () => `${name}-grant-${String((grants.next += 1)).padStart(8, "0")}` }
  const kept = new Map<string, Destination>()
  const destinations: DestinationStore = {
    list: async () => Ok([...kept.values()]),
    write: async (destination) => Ok(void kept.set(destination.lineId, destination)),
    remove: async (lineId) => Ok(void kept.delete(lineId)),
  }
  const sent = { next: 0 }
  const clock = { now: "2026-10-09T02:00:00.000Z" }
  const drafts = keepingHistory(memoryDrafts(), () => clock.now)
  const sending: SendingPorts = { drafts, relay, sealer, now: () => clock.now, newId: () => `${name}-sent-${String((sent.next += 1)).padStart(10, "0")}` }
  const inbox: InboxPorts = { links, relay, sealer, invitations: inviting.invitations, drafts, follow: memoryFollow() }
  const record = (date: string, yen: number, note: string) =>
    session.write(BOOK, async (_journal, stored) =>
      Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", entry(date, yen, note)) }, intent: { type: "pool-opened", parlor: note, tier: "4円", date: "2026-10-01" as IsoDate, rate: dec("4") } }),
    )
  const role = async () => ((books) => (books.ok ? books.value.map((book) => roleIn(book, ME)) : books))(await session.books())
  return { ports, inviting, sending, inbox, destinations, drafts, clock, session, record, role, files: () => storage.peek(BOOK)?.files }
}

/** An owner whose book is on its line, as inviting needs. */
const owner = async (relay: Relay) => {
  const made = await device("owner", relay)
  await made.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [made.ports.me] }))
  await startSync(made.ports, BOOK, RELAY_URL)
  await syncBook(made.ports, BOOK)
  return made
}

const invited = async (from: Awaited<ReturnType<typeof owner>>, name: string, role: "editor" | "viewer" | "sender") => {
  const kept = await invite(from.inviting, BOOK, "軍団", name, role)
  return kept.ok ? kept.value : (undefined as never)
}

describe("a person let into a book to read it", () => {
  test("is handed a code that is no secret, joins as a viewer, and takes in what the owner writes after", async () => {
    const relay = memoryRelay()
    const mine = await owner(relay)
    const kept = await invited(mine, "たけし", "viewer")
    expect([kept.name, kept.role, readInvitation(kept.code)?.role, /^[A-Za-z0-9_-]{43}$/.test(kept.code)]).toEqual(["たけし", "viewer", "viewer", false])
    expect(await invitationsOf(mine.inviting, BOOK)).toEqual({ ok: true, value: [kept] })

    const theirs = await device("takeshi", relay)
    expect(await joinSync(theirs.ports, kept.code, RELAY_URL)).toEqual({ ok: true, value: BOOK })
    expect(await theirs.role()).toEqual(["viewer"])
    expect(theirs.files()).toEqual(mine.files())

    await mine.record("2026-10-09", 3000, "after")
    await syncBook(mine.ports, BOOK)
    expect(await syncBook(theirs.ports, BOOK)).toEqual({ ok: true, value: { received: 1, sent: 0 } })
    expect(theirs.files()).toEqual(mine.files())
  })

  test("writes nothing: not to the book on their own device, and nothing reaches the line", async () => {
    const relay = memoryRelay()
    const mine = await owner(relay)
    const theirs = await device("takeshi", relay)
    await joinSync(theirs.ports, (await invited(mine, "たけし", "viewer")).code, RELAY_URL)
    const before = relay.kept().length
    expect(await theirs.record("2026-10-09", 500, "theirs")).toEqual({ ok: false, error: { type: "forbidden", capability: "write" } })
    await syncBook(theirs.ports, BOOK)
    expect(relay.kept().length).toBe(before)
  })
})

describe("a person let into a book to write to it", () => {
  test("joins as an editor, and what they write reaches the owner", async () => {
    const relay = memoryRelay()
    const mine = await owner(relay)
    const theirs = await device("yuji", relay)
    await joinSync(theirs.ports, (await invited(mine, "ゆうじ", "editor")).code, RELAY_URL)
    expect(await theirs.role()).toEqual(["editor"])
    expect((await theirs.record("2026-10-09", 700, "theirs")).ok).toBe(true)
    expect(await syncBook(theirs.ports, BOOK)).toEqual({ ok: true, value: { received: 0, sent: 1 } })
    expect(await syncBook(mine.ports, BOOK)).toEqual({ ok: true, value: { received: 1, sent: 0 } })
    expect(mine.files()).toEqual(theirs.files())
  })

  test("does not rename the book, which is its owner's to name, by the name's field or by a hand in its journal", async () => {
    const relay = memoryRelay()
    const mine = await owner(relay)
    const theirs = await device("yuji", relay)
    await joinSync(theirs.ports, (await invited(mine, "ゆうじ", "editor")).code, RELAY_URL)
    expect(await renameBook(theirs.session, BOOK, "ゆうじ軍団")).toEqual({ ok: false, error: { type: "forbidden", capability: "rename" } })
    expect((await renameBook(mine.session, BOOK, "軍団 10月")).ok).toBe(true)
    await syncBook(mine.ports, BOOK)
    await syncBook(theirs.ports, BOOK)
    expect(((books) => books.ok && books.value.map((book) => book.title))(await theirs.session.books())).toEqual(["軍団 10月"])
  })

  test("lets nobody else in, and does not make the line again where it is gone", async () => {
    const relay = memoryRelay()
    const mine = await owner(relay)
    const theirs = await device("yuji", relay)
    await joinSync(theirs.ports, (await invited(mine, "ゆうじ", "editor")).code, RELAY_URL)
    expect(await invite(theirs.inviting, BOOK, "軍団", "だれか", "viewer")).toEqual({ ok: false, error: { type: "sync", problem: { type: "not-permitted" } } })
    await theirs.record("2026-10-09", 700, "theirs")
    relay.letGo()
    expect(await syncBook(theirs.ports, BOOK)).toEqual({ ok: false, error: { type: "sync", problem: { type: "line-missing" } } })
    expect(relay.kept().length).toBe(0)
  })
})

describe("a person taken back out of a book", () => {
  test("is shut out of its line from then on, and is no longer among those let in", async () => {
    const relay = memoryRelay()
    const mine = await owner(relay)
    const kept = await invited(mine, "ゆうじ", "editor")
    const other = await invited(mine, "たけし", "viewer")
    const theirs = await device("yuji", relay)
    await joinSync(theirs.ports, kept.code, RELAY_URL)
    expect(await uninvite(mine.inviting, kept)).toEqual({ ok: true, value: undefined })
    expect(await invitationsOf(mine.inviting, BOOK)).toEqual({ ok: true, value: [other] })
    await mine.record("2026-10-09", 900, "after")
    await syncBook(mine.ports, BOOK)
    expect(await syncBook(theirs.ports, BOOK)).toEqual({ ok: false, error: { type: "sync", problem: { type: "shut-out" } } })
    expect(theirs.files()).not.toEqual(mine.files())
  })
})

describe("letting a person in", () => {
  test("waits for the book's line to be on its relay, and is the owner's of a synced book alone", async () => {
    const relay = memoryRelay()
    const made = await device("owner", relay)
    await made.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [made.ports.me] }))
    expect(await invite(made.inviting, BOOK, "軍団", "たけし", "viewer")).toEqual({ ok: false, error: { type: "sync", problem: { type: "not-linked" } } })
    await startSync(made.ports, BOOK, RELAY_URL)
    expect(await invite(made.inviting, BOOK, "軍団", "たけし", "viewer")).toEqual({ ok: false, error: { type: "sync", problem: { type: "line-missing" } } })
    await syncBook(made.ports, BOOK)
    expect((await invite(made.inviting, BOOK, "軍団", "たけし", "viewer")).ok).toBe(true)
  })
})

describe("a person let in only to send plays", () => {
  const LEDGER = "ledger" as BookId
  const PLAY = "sent-1" as PlayId
  const DRAFT: PlayDraft = {
    id: PLAY,
    bookId: "own" as BookId,
    date: "2026-10-09" as IsoDate,
    venue: { type: "parlor", parlor: MALEHAN, terms: { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 275 } } },
    gameKind: "pachinko",
    machine: "流星",
    pachinko: undefined,
    cabinetNumber: "123",
    startedAt: "2026-10-09T01:00:00.000Z",
    log: '{"spins":0,"outlay":0}\n{"spins":250,"outlay":1000}\n',
  }
  /** An owner with a second book to record into, and a sender with plays of their own day that the owner never sees until they are sent. */
  const both = async () => {
    const relay = memoryRelay()
    const mine = await owner(relay)
    await mine.session.createBook(firstBook(LEDGER, ME, "マイ帳簿"))
    const kept = await invited(mine, "けんじ", "sender")
    const theirs = await device("kenji", relay)
    const joined = await joinByCode({ ...theirs.ports, destinations: theirs.destinations }, kept.code, RELAY_URL)
    const [destination] = ((found) => (found.ok ? found.value : []))(await destinationsOf(theirs.destinations))
    await startPlay(theirs.drafts, DRAFT)
    return { relay, mine, theirs, kept, joined, destination: destination as Destination }
  }
  const mineOf = async (made: Awaited<ReturnType<typeof both>>["mine"]) => ((found) => (found.ok ? found.value : []))(await loadDrafts(made.drafts))

  test("is handed a code that says what the book is called, and has no book of it on their device", async () => {
    const { theirs, kept, joined, destination } = await both()
    expect([readInvitation(kept.code)?.role, readInvitation(kept.code)?.title]).toEqual(["sender", "軍団"])
    expect(joined).toEqual({ ok: true, value: { type: "destination", title: "軍団" } })
    expect(destination.title).toBe("軍団")
    expect(((books) => books.ok && books.value.length)(await theirs.session.books())).toBe(0)
    expect(await joinSync(theirs.ports, kept.code, RELAY_URL)).toEqual({ ok: false, error: { type: "sync", problem: { type: "not-a-pairing-code" } } })
  })

  test("tells a play that arrived broken apart, once, and takes none of it in", async () => {
    const { mine, theirs, destination } = await both()
    await sendDraft(theirs.sending, DRAFT, destination)
    const broken: Relay = {
      ...mine.inbox.relay,
      entriesAfter: async (access, after) =>
        mapOk(await mine.inbox.relay.entriesAfter(access, after), (page) => ({ ...page, entries: page.entries.map((entry) => (entry.commitId.startsWith(INBOX_OPENING) ? entry : { ...entry, box: entry.box.slice(0, 12) })) })),
    }
    expect(await receiveArrivals({ ...mine.inbox, relay: broken })).toEqual({ taken: 0, unreadable: 1 })
    expect(await mineOf(mine)).toEqual([])
    expect(await receiveArrivals(mine.inbox)).toEqual({ taken: 0, unreadable: 0 })
  })

  test("sends a play of their day with its history, which joins the owner's day under their name and their invitation's id, in the book it was sent to", async () => {
    const { mine, theirs, kept, destination } = await both()
    const revised = await reviseCheckpoints(theirs.drafts, DRAFT, [{ spins: 0, outlay: 0 }, { spins: 250, outlay: 2000 }])
    const sent = await sendDraft(theirs.sending, revised.ok ? revised.value : DRAFT, destination)
    expect(sent.ok && isSentAsItStands(sent.value, destination.lineId)).toBe(true)
    expect(await receiveArrivals(mine.inbox)).toEqual({ taken: 1, unreadable: 0 })
    const [arrived] = await mineOf(mine)
    expect([arrived?.id, arrived?.bookId, arrived?.received?.sender, arrived?.log, arrived?.recorded, arrived?.sent]).toEqual([PLAY, BOOK, "けんじ", '{"spins":0,"outlay":0}\n{"spins":250,"outlay":2000}\n', undefined, undefined])
    expect(arrived === undefined ? undefined : senderOf(arrived)).toEqual({ id: kept.id, name: "けんじ" })
    expect(arrived?.history).toEqual([{ at: "2026-10-09T02:00:00.000Z", removed: ['{"spins":250,"outlay":1000}'], added: ['{"spins":250,"outlay":2000}'] }])
    expect(arrived?.venue.type === "parlor" && arrived.venue.parlor.pools).toEqual([])
    expect(await receiveArrivals(mine.inbox)).toEqual({ taken: 0, unreadable: 0 })
  })

  test("is recorded by the owner into a book of their choosing, set right first, and what the sender changed after it finished is told apart", async () => {
    const { mine, theirs, destination } = await both()
    await theirs.drafts.updateDraft({ ...DRAFT, recorded: { at: "2026-10-09T03:00:10.000Z", finish: { at: "2026-10-09T03:00:00.000Z", counter: undefined } } }, DRAFT.log)
    theirs.clock.now = "2026-10-09T05:00:00.000Z"
    await reviseCheckpoints(theirs.drafts, DRAFT, [{ spins: 0, outlay: 0 }, { spins: 250, outlay: 1000, held: 9000 }])
    await sendDraft(theirs.sending, DRAFT, destination)
    await receiveArrivals(mine.inbox)
    const [arrived] = await mineOf(mine)
    expect(afterItFinished(arrived as PlayDraft).map((operation) => operation.at)).toEqual(["2026-10-09T05:00:00.000Z"])
    const moved = await chooseBook(mine.drafts, arrived as PlayDraft, LEDGER)
    expect(moved.ok && moved.value.bookId).toBe(LEDGER)
    const record = { ...RECORD, parlor: moved.ok && moved.value.venue.type === "parlor" ? { ...moved.value.venue.parlor, pools: [RECORD.pool] } : MALEHAN }
    expect((await finishPlay(mine.session, mine.drafts, moved.ok ? moved.value : DRAFT, LEDGER, record, { at: "2026-10-09T03:00:00.000Z", counter: undefined }, "2026-10-09T12:00:00.000Z")).ok).toBe(true)
    const overview = await loadOverview(mine.session, LEDGER, "")
    expect(overview.ok && toPlainString(overview.value.theoretical)).toBe("5500")
  })

  test("sends a play again once it is set right: taking the place of one the owner left as it arrived, and kept beside one the owner changed", async () => {
    const { mine, theirs, destination } = await both()
    await sendDraft(theirs.sending, DRAFT, destination)
    await receiveArrivals(mine.inbox)
    const again = await reviseCheckpoints(theirs.drafts, DRAFT, [{ spins: 0, outlay: 0 }, { spins: 300, outlay: 1000 }])
    await sendDraft(theirs.sending, again.ok ? again.value : DRAFT, destination)
    await receiveArrivals(mine.inbox)
    const [replaced] = await mineOf(mine)
    expect([replaced?.log, replaced?.received?.again]).toEqual(['{"spins":0,"outlay":0}\n{"spins":300,"outlay":1000}\n', undefined])
    const touched = await reviseCheckpoints(mine.drafts, replaced as PlayDraft, [{ spins: 0, outlay: 0 }, { spins: 300, outlay: 1500 }])
    const third = await reviseCheckpoints(theirs.drafts, again.ok ? again.value : DRAFT, [{ spins: 0, outlay: 0 }, { spins: 400, outlay: 1000 }])
    await sendDraft(theirs.sending, third.ok ? third.value : DRAFT, destination)
    await receiveArrivals(mine.inbox)
    const [kept] = await mineOf(mine)
    expect([kept?.log, kept?.received?.again?.log]).toEqual([touched.ok ? touched.value.log : "", '{"spins":0,"outlay":0}\n{"spins":400,"outlay":1000}\n'])
    await takeSentAgain(mine.drafts, kept as PlayDraft)
    expect((await mineOf(mine))[0]?.log).toBe('{"spins":0,"outlay":0}\n{"spins":400,"outlay":1000}\n')
  })

  test("reads nothing of the inbox or the book, and sends nothing once taken back out", async () => {
    const { relay, mine, theirs, kept, destination } = await both()
    const keys = await theirs.sending.sealer.keysOf(kept.code)
    expect(keys.ok && (await relay.entriesAfter({ relayUrl: RELAY_URL, lineId: keys.value.lineId, token: keys.value.token }, 0))).toEqual({ ok: false, error: { type: "not-permitted" } })
    await uninvite(mine.inviting, kept)
    expect(await sendDraft(theirs.sending, DRAFT, destination)).toEqual({ ok: false, error: { type: "sync", problem: { type: "shut-out" } } })
  })
})

describe("a relay that let go of a book's lines", () => {
  test("is told again whom the owner let in, so that nobody is shut out of the lines made again", async () => {
    const relay = memoryRelay()
    const mine = await owner(relay)
    const editor = await invited(mine, "ゆうじ", "editor")
    const sender = await invited(mine, "けんじ", "sender")
    const theirs = await device("yuji", relay)
    await joinSync(theirs.ports, editor.code, RELAY_URL)
    relay.letGo()
    await syncBook(mine.ports, BOOK)
    expect(await syncBook(theirs.ports, BOOK)).toEqual({ ok: false, error: { type: "sync", problem: { type: "shut-out" } } })
    expect(await restoreGrants(mine.inviting, BOOK)).toEqual({ ok: true, value: undefined })
    expect((await syncBook(theirs.ports, BOOK)).ok).toBe(true)
    const kenji = await device("kenji", relay)
    await joinByCode({ ...kenji.ports, destinations: kenji.destinations }, sender.code, RELAY_URL)
    const [destination] = ((found) => (found.ok ? found.value : []))(await destinationsOf(kenji.destinations))
    const draft: PlayDraft = { id: "sent-9" as PlayId, bookId: "own" as BookId, date: "2026-10-09" as IsoDate, venue: { type: "none", terms: undefined }, gameKind: "pachinko", machine: "流星", pachinko: undefined, cabinetNumber: undefined, startedAt: "2026-10-09T01:00:00.000Z", log: '{"spins":0}\n' }
    await startPlay(kenji.drafts, draft)
    expect((await sendDraft(kenji.sending, draft, destination as Destination)).ok).toBe(true)
  })
})
