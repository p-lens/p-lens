import { createBookSession, type BookSession } from "../../../src/application/book-session"
import type { BookId, Member } from "../../../src/core/book/book"
import { localDayOf, type IsoDate } from "../../../src/core/calendar/calendar"
import { appendEntry, BOOK_FILES, type BookFiles } from "../../../src/core/journal/layout"
import type { PlayId } from "../../../src/core/play/play"
import { Ok } from "../../../src/core/result/result"
import type { HledgerClient } from "../../../src/hledger/client/client"
import { openBookLine, type BookLine, type LineStanding } from "../../../src/crossing/application/book-line"
import { joinByCode } from "../../../src/crossing/application/joining"
import { isOwnersLink, startSync, syncCodeOf, type BookSyncPorts } from "../../../src/crossing/application/book-sync"
import { openPlaysLine, type PlaysLine } from "../../../src/crossing/application/plays-line"
import { createWebCryptoKeys } from "../../../src/crossing/browser/web-crypto-keys"
import { createWebSocketRelays } from "../../../src/crossing/browser/websocket-relays"
import { createMemoryLineStore } from "../../../src/crossing/memory/memory-line-store"
import type { BookLink, FollowedPlay } from "../../../src/crossing/port/line-store"
import type { Connection } from "../../../src/crossing/port/relay"
import { createMemoryHistory } from "../../../src/history/adapters/memory-history"
import { fixtureBook, memoryDrafts, memoryStorage } from "../../support/in-process"
import { startTestRelay } from "./test-relay"

export const BOOK = "book-sync-1" as BookId
export const ME: Member = { id: "local" as Member["id"], displayName: "自分", role: "owner" }

/** The business day the devices are on: today's, so that what they write has not expired at the relay. */
export const TODAY: IsoDate = localDayOf(new Date())

const keys = createWebCryptoKeys()
const relays = createWebSocketRelays()

/** A book's lines as one of the owner's devices keeps them open: the book's and its plays', on one connection. */
export interface Opened {
  readonly book: BookLine
  readonly plays: PlaysLine
  readonly close: () => Promise<void>
}

/** A book's line alone, as the device of a person let in keeps it open. */
export interface OpenedBook {
  readonly book: BookLine
  readonly close: () => Promise<void>
}

/** What a test keeps of its relay and every line it opened, so that each is let go of after it. */
const held = { relay: undefined as ReturnType<typeof startTestRelay> | undefined, opened: [] as OpenedBook[] }

/** A relay for the test, stopped after it. */
export const startRelay = (): ReturnType<typeof startTestRelay> => {
  held.relay = startTestRelay()
  return held.relay
}

export const relayOf = (): ReturnType<typeof startTestRelay> | undefined => held.relay

/** Every line closed and the relay stopped: after each test. */
export const letEverythingGo = async (): Promise<void> => {
  await Promise.all(held.opened.map((opened) => opened.close()))
  held.opened = []
  held.relay?.stop()
}

/** Every line a test opened closed, the relay kept: two devices going apart. */
export const closeLines = async (): Promise<void> => {
  await Promise.all(held.opened.map((opened) => opened.close()))
  held.opened = []
}

/** A device: its own books, plays, hledger and lines, on the test relay. */
export const deviceOn = (relayUrl: string, hledger: HledgerClient) => {
  const storage = memoryStorage()
  const session: BookSession = createBookSession({ hledger, storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date(), newId: () => crypto.randomUUID(), member: ME.id })
  const lines = createMemoryLineStore()
  const drafts = memoryDrafts()
  const ports: BookSyncPorts = { keys, relays, information: { labelsOf: async () => Ok(0) }, lines, session, drafts, me: ME, businessDay: () => TODAY, relayUrl, clock: () => Date.now(), newId: () => crypto.randomUUID() }
  const standings: LineStanding[] = []
  const heard: { followed: readonly FollowedPlay[]; yielded: { readonly playId: PlayId; readonly lost: number }[]; draftsChanged: number; removed: number } = { followed: [], yielded: [], draftsChanged: 0, removed: 0 }
  const linkOf = async (): Promise<BookLink> => {
    const link = await lines.links()
    const found = link.ok ? link.value.find((each) => each.bookId === BOOK) : undefined
    if (found === undefined) throw new Error("no link")
    return found
  }
  const bookLineOn = async (found: BookLink, connection: Connection): Promise<BookLine> => {
    const book = await openBookLine(ports, found, connection, {
      onStanding: (standing) => standings.push(standing),
      onBookChanged: () => undefined,
      onGone: () => standings.push({ type: "stopped", problem: { type: "nothing-on-line" } }),
      onRemoved: () => {
        heard.removed += 1
      },
    })
    if (!book.ok) throw new Error(JSON.stringify(book.error))
    return book.value
  }
  /** The book's line alone, whatever the device is on it. */
  const openBook = async (): Promise<OpenedBook> => {
    const found = await linkOf()
    const connection = relays.connect(found.relay)
    const book = await bookLineOn(found, connection)
    const opened: OpenedBook = { book, close: async () => void (await book.close().finally(connection.close)) }
    held.opened.push(opened)
    return opened
  }
  /** The book's line and its plays', on one of the owner's devices. */
  const open = async (): Promise<Opened> => {
    const found = await linkOf()
    if (!isOwnersLink(found)) throw new Error("not the owner's")
    const connection = relays.connect(found.relay)
    const book = { value: await bookLineOn(found, connection) }
    const plays = await openPlaysLine(ports, found, connection, {
      onFollowed: (followed) => {
        heard.followed = followed
      },
      onYielded: (playId, lost) => heard.yielded.push({ playId, lost }),
      onDraftsChanged: () => {
        heard.draftsChanged += 1
      },
    })
    if (!plays.ok) throw new Error(JSON.stringify(plays.error))
    const opened: Opened = { book: book.value, plays: plays.value, close: async () => void (await Promise.all([book.value.close(), plays.value.close()]).finally(connection.close)) }
    held.opened.push(opened)
    return opened
  }
  const files = async (): Promise<BookFiles> => ((stored) => (stored.ok ? stored.value.files : {}))(await session.stored(BOOK))
  const write = async (entry: string): Promise<void> => {
    const written = await session.write(BOOK, async (_, stored) => Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", entry) }, intent: { type: "file-edited", path: BOOK_FILES.transactions } }))
    if (!written.ok) throw new Error(JSON.stringify(written.error))
  }
  const rewrite = async (from: string, to: string): Promise<void> => {
    const written = await session.write(BOOK, async (_, stored) => Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: (stored.files[BOOK_FILES.transactions] ?? "").replace(from, to) }, intent: { type: "file-edited", path: BOOK_FILES.transactions } }))
    if (!written.ok) throw new Error(JSON.stringify(written.error))
  }
  return { ports, session, storage, lines, drafts, standings, heard, open, openBook, linkOf, files, write, rewrite, last: () => standings.at(-1) }
}

export type Device = ReturnType<typeof deviceOn>

export const until = async (condition: () => boolean | Promise<boolean>, ms = 8_000): Promise<void> => {
  const started = Date.now()
  while (!(await condition())) {
    if (Date.now() - started > ms) throw new Error("timed out")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** Two of the owner's devices with the fixture book on a line between them, the second joined by the first's code. */
export const twoDevices = async (hledgers: readonly HledgerClient[], seed?: (files: BookFiles) => BookFiles) => {
  const relay = startRelay()
  const [one, other] = [deviceOn(relay.url, hledgers[0] as HledgerClient), deviceOn(relay.url, hledgers[1] as HledgerClient)]
  const fixture = await fixtureBook("basic-play", { id: BOOK, members: [ME] })
  const created = await one.session.createBook(seed === undefined ? fixture : { ...fixture, files: seed(fixture.files) })
  if (!created.ok) throw new Error(JSON.stringify(created.error))
  const started = await startSync(one.ports, BOOK)
  if (!started.ok || !isOwnersLink(started.value)) throw new Error(JSON.stringify(started))
  const lineOne = await one.open()
  await until(() => one.last()?.type === "synced")
  const joined = await joinByCode(other.ports, syncCodeOf(started.value))
  if (!joined.ok) throw new Error(JSON.stringify(joined.error))
  const lineOther = await other.open()
  await until(() => other.last()?.type === "synced")
  return { one, other, lineOne, lineOther, code: syncCodeOf(started.value) }
}
