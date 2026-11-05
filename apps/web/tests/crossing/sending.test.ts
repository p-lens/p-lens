import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"

import type { PlayDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import { Ok } from "../../src/core/result/result"
import type { HledgerClient } from "../../src/hledger/client/client"
import { isOwnersLink, startSync } from "../../src/crossing/application/book-sync"
import { openInboxLine, type ReceivedPlay } from "../../src/crossing/application/inbox-line"
import { joinByCode } from "../../src/crossing/application/joining"
import { openSendingLine, type SendingLine } from "../../src/crossing/application/sending-line"
import { createWebSocketRelays } from "../../src/crossing/browser/websocket-relays"
import { KIND } from "../../src/crossing/core/kinds"
import type { Destination } from "../../src/crossing/port/line-store"
import { fixtureBook, inProcessHledger } from "../support/in-process"
import { BOOK, deviceOn, letEverythingGo, ME, startRelay, TODAY, until, type Device } from "./support/devices"

const MARKER = "MARKER-第三新東京-0707"

const held = { hledgers: [] as HledgerClient[] }

beforeAll(async () => {
  held.hledgers = await Promise.all([inProcessHledger(), inProcessHledger()])
})

afterEach(letEverythingGo)

afterAll(() => {
  held.hledgers = []
})

const relays = createWebSocketRelays()

const playOf = (id: string, lines: number, machine = "ミスターパチンコ"): PlayDraft => ({
  id: id as PlayId,
  date: TODAY,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  pachinko: undefined,
  machine,
  cabinetNumber: undefined,
  startedAt: `${TODAY}T01:00:00.000Z`,
  log: Array.from({ length: lines }, (_, index) => JSON.stringify({ spins: index * 10, outlay: index * 500, at: `${TODAY}T01:${String(index % 60).padStart(2, "0")}:00.000Z` })).join("\n"),
})

/** The owner's device with the fixture book on a line and its inbox open, and a sender's device with nothing yet. */
const owned = async () => {
  const relay = startRelay()
  const owner = deviceOn(relay.url, held.hledgers[0] as HledgerClient)
  const created = await owner.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [ME] }))
  if (!created.ok) throw new Error(JSON.stringify(created.error))
  const started = await startSync(owner.ports, BOOK)
  if (!started.ok || !isOwnersLink(started.value)) throw new Error(JSON.stringify(started))
  const ownerLine = await owner.open()
  await until(() => owner.last()?.type === "synced")
  const inbox: { received: readonly ReceivedPlay[] } = { received: [] }
  const connection = relays.connect(relay.url)
  const opened = await openInboxLine(owner.ports, started.value, connection, () => ownerLine.book.members(), { onReceived: (received) => (inbox.received = received) })
  const sender = deviceOn(relay.url, held.hledgers[1] as HledgerClient)
  return {
    relay,
    owner,
    ownerLine,
    sender,
    inbox,
    closeInbox: () => {
      opened.close()
      connection.close()
    },
    sendersChanged: opened.sendersChanged,
  }
}

/** A sender let in by their own code, joined, with their destination's line open. */
const letSend = async (setup: Awaited<ReturnType<typeof owned>>, name: string) => {
  const member = await setup.ownerLine.book.invite(name, "sender")
  if (!member.ok) throw new Error(JSON.stringify(member.error))
  setup.sendersChanged()
  const joined = await joinByCode(setup.sender.ports, member.value.code)
  if (!joined.ok) throw new Error(JSON.stringify(joined.error))
  const destination = await destinationOf(setup.sender)
  const heard = { removed: 0 }
  const connection = relays.connect(destination.relay)
  const line = await openSendingLine(setup.sender.ports, destination, connection, { onRemoved: () => (heard.removed += 1), onChanged: () => undefined })
  if (!line.ok) throw new Error(JSON.stringify(line.error))
  return { member: member.value, joined: joined.value, line: line.value, heard, close: async () => void (await line.value.close().finally(connection.close)) }
}

const destinationOf = async (device: Device): Promise<Destination> => {
  const found = await device.lines.destinations()
  const destination = found.ok ? found.value[0] : undefined
  if (destination === undefined) throw new Error("no destination")
  return destination
}

const receivedLog = (setup: Awaited<ReturnType<typeof owned>>, id: string): string | undefined => setup.inbox.received.find((each) => each.play.id === id)?.play.log

const sent = async (line: SendingLine, device: Device, play: PlayDraft): Promise<void> => {
  const created = await device.drafts.createDraft(play)
  if (!created.ok) throw new Error(JSON.stringify(created.error))
  expect(await line.send(play.id)).toEqual(Ok(undefined))
}

describe("plays sent to a book's owner", () => {
  test("a sender joins by their code as somewhere to send to, with no book on their device", async () => {
    const setup = await owned()
    const { joined } = await letSend(setup, "ジゲン")
    expect(joined).toEqual({ type: "inbox", title: "サンプル帳簿" })
    expect(((books) => (books.ok ? books.value.length : -1))(await setup.sender.session.books())).toBe(0)
    expect((await setup.ownerLine.book.members()).map((member) => [member.name, member.role])).toEqual([["ジゲン", "sender"]])
    setup.closeInbox()
  }, 30_000)

  test("what a sender sends reaches the owner as it changes, named as theirs, and goes when they stop", async () => {
    const setup = await owned()
    const { line, close } = await letSend(setup, "ゴエモン")
    await sent(line, setup.sender, playOf("sent-1", 3))
    await until(() => receivedLog(setup, "sent-1") === playOf("sent-1", 3).log)
    expect(setup.inbox.received[0]?.sender.name).toBe("ゴエモン")
    expect(setup.inbox.received[0]?.play.bookId).toBeUndefined()
    const draft = playOf("sent-1", 3)
    await setup.sender.drafts.updateDraft({ ...draft, log: `${draft.log}\n{"spins":99}` }, draft.log)
    line.sendNow()
    await until(() => receivedLog(setup, "sent-1")?.endsWith('{"spins":99}') === true)
    expect(await line.stop("sent-1" as PlayId)).toEqual(Ok(undefined))
    await until(() => setup.inbox.received.length === 0)
    await close()
    setup.closeInbox()
  }, 30_000)

  test("a long log goes in pieces and comes back whole", async () => {
    const setup = await owned()
    const { line, close } = await letSend(setup, "フジコ")
    const long = playOf("sent-2", 1200)
    await sent(line, setup.sender, long)
    await until(() => receivedLog(setup, "sent-2") === long.log, 15_000)
    expect(setup.relay.events().filter((event) => event.kind === KIND.sentPlay).length).toBeGreaterThan(1)
    await close()
    setup.closeInbox()
  }, 30_000)

  test("a sender taken out is told, sends nothing more, and what they sent is dropped", async () => {
    const setup = await owned()
    const { member, line, heard, close } = await letSend(setup, "ゼニガタ")
    await sent(line, setup.sender, playOf("sent-3", 2))
    await until(() => setup.inbox.received.length === 1)
    expect(await setup.ownerLine.book.remove(member.mailbox)).toEqual(Ok(undefined))
    setup.sendersChanged()
    await until(() => heard.removed === 1)
    await until(() => setup.inbox.received.length === 0)
    expect((await destinationOf(setup.sender)).removed).toBe(true)
    expect(await line.send("sent-3" as PlayId)).toEqual({ ok: false, error: { type: "removed" } })
    expect((await setup.ownerLine.book.members()).length).toBe(0)
    await close()
    setup.closeInbox()
  }, 30_000)

  test("what is sent, and who it is sent by, never reaches the relay readable", async () => {
    const setup = await owned()
    const { line, close } = await letSend(setup, MARKER)
    await sent(line, setup.sender, playOf("sent-4", 3, MARKER))
    await until(() => setup.inbox.received.length === 1)
    const everything = JSON.stringify(setup.relay.events())
    expect(everything).not.toContain(MARKER)
    expect(everything).not.toContain("sent-4")
    expect(setup.relay.events().every((event) => event.tags.every((tag) => ["v", "d", "expiration"].includes(tag[0] ?? "")))).toBe(true)
    await close()
    setup.closeInbox()
  }, 30_000)
})
