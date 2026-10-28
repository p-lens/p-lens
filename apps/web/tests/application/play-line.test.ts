import { describe, expect, test } from "bun:test"

import { receiveArrivals, type InboxPorts } from "../../src/application/inbox"
import { loadTodaysPlays } from "../../src/application/live-play"
import { continueHere, finishingHeld, flushOnHide, followPlays, heldBeforeFinishing, isLargeShowing, loadFollowedToday, loadLivePlay, readPlayLines, showHeldPlays, type KeptLine, type PlayLinePorts } from "../../src/application/play-line"
import type { BookSession } from "../../src/application/book-session"
import type { YenTally } from "../../src/core/tally/tally"
import type { BookId, MemberId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayDraft } from "../../src/core/live-play/draft"
import type { DeviceId } from "../../src/core/play-line/device"
import { readShownPlay, shownPlayOf, type ShownPlay } from "../../src/core/play-line/entry"
import { standingsOf } from "../../src/core/play-line/following"
import type { PlayLineAction } from "../../src/core/play-line/reconcile"
import { Err, Ok } from "../../src/core/result/result"
import { sentDraftOf, sentDraftText } from "../../src/core/sync/sent-draft"
import { createConnection } from "../../src/storage/browser/database"
import { createIndexedDbDrafts, createIndexedDbFollow } from "../../src/storage/browser/indexed-db"
import { createDeflatePacker } from "../../src/sync/deflate/deflate-packer"
import type { Relay } from "../../src/sync/port/relay"
import { accessOf } from "../../src/sync/port/sealer"
import { createWebCryptoSealer } from "../../src/sync/web-crypto/web-crypto-sealer"
import { memoryIndexedDb } from "../support/memory-indexed-db"
import { A, B, BOOK, DRAFT, OTHER_BOOK, PLAY, TODAY, YESTERDAY, playAt } from "../support/play-line"
import { memoryInvitations, memoryLinks, memoryRelay } from "../support/sync"

const RELAY_URL = "https://relay.test"
const ME = "local" as MemberId
const C = "device-c" as DeviceId
const sealer = createWebCryptoSealer()
const SECRETS: Readonly<Record<string, string>> = { [BOOK]: sealer.newSecret(), [OTHER_BOOK]: sealer.newSecret() }

const unwrapped = <T>(outcome: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }): T => {
  if (!outcome.ok) throw new Error(`expected ok: ${JSON.stringify(outcome.error)}`)
  return outcome.value
}

const logOf = (count: number): string => playAt(count).log

/** One of the owner's devices: a store of its own, its own name on the lines, the books it syncs as their owner, and the relay they all reach. */
const deviceOn = async (relay: Relay, me: DeviceId, synced: readonly BookId[] = [BOOK]) => {
  globalThis.indexedDB = memoryIndexedDb()
  const connection = createConnection()
  await connection()
  const drafts = createIndexedDbDrafts(connection)
  const follow = createIndexedDbFollow(connection)
  const links = memoryLinks()
  await Promise.all(synced.map((bookId) => links.write({ bookId, relayUrl: RELAY_URL, secret: SECRETS[bookId] ?? "", cursor: 0 })))
  const clock: { now: string; day: IsoDate; next: number } = { now: "2026-10-28T02:00:00.000Z", day: TODAY, next: 0 }
  const books = [BOOK, OTHER_BOOK].map((id) => ({ id, members: [{ id: ME, displayName: "自分", role: "owner" as const }] }))
  const ports: PlayLinePorts = {
    relay,
    sealer,
    packer: createDeflatePacker(),
    links,
    drafts,
    follow,
    device: async () => me,
    books: async () => Ok(books),
    member: ME,
    now: () => clock.now,
    businessDay: () => clock.day,
    newId: () => `${me}-${String((clock.next += 1)).padStart(12, "0")}`,
  }
  const held: { lines: readonly KeptLine[] } = { lines: [] }
  const read = async (): Promise<readonly PlayLineAction[]> => {
    const lines = unwrapped(await readPlayLines(ports, held.lines))
    const followed = unwrapped(await followPlays(ports, lines))
    held.lines = followed.lines
    return followed.acted
  }
  const show = async (): Promise<readonly PlayLineAction[]> => {
    const shown = unwrapped(await showHeldPlays(ports, held.lines))
    held.lines = shown.lines
    return shown.acted
  }
  return { ports, drafts, follow, links, clock, held, read, show }
}

const kinds = (actions: readonly PlayLineAction[]): readonly string[] => actions.map((action) => action.type)

/** The play as a device has it, by what it holds or keeps a copy of. */
const hold = async (device: Awaited<ReturnType<typeof deviceOn>>): Promise<readonly [string, string] | undefined> => {
  const found = await loadLivePlay(device.drafts, device.follow, PLAY)
  if (!found.ok) return undefined
  return found.value.type === "held" ? ["held", found.value.draft.log] : ["followed", found.value.followed.play.log]
}

/** Who the lines of a book say holds the play, read afresh by a device that syncs it. */
const holderOn = async (relay: Relay): Promise<DeviceId | undefined> => {
  const reader = await deviceOn(relay, "device-reader" as DeviceId)
  const standing = standingsOf(unwrapped(await readPlayLines(reader.ports, []))).get(PLAY)
  return standing?.type === "held" ? standing.by : undefined
}

const begun = async (device: Awaited<ReturnType<typeof deviceOn>>, draft: PlayDraft = DRAFT) => {
  await device.drafts.createDraft(draft)
  await device.show()
}

describe("a play held on one device", () => {
  test("is shown on its book's line, and followed as a copy on the owner's other device", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    expect(kinds(await b.read())).toEqual(["put-followed"])
    expect(await hold(b)).toEqual(["followed", logOf(1)])
    expect(await b.drafts.readDraft(PLAY)).toEqual({ ok: false, error: { type: "held-elsewhere", playId: PLAY } })

    await a.drafts.updateDraft({ ...DRAFT, log: logOf(2) }, DRAFT.log)
    a.clock.now = "2026-10-28T02:00:04.000Z"
    await a.show()
    expect(kinds(await b.read())).toEqual(["put-followed"])
    expect(await hold(b)).toEqual(["followed", logOf(2)])
  })

  test("is not shown again while it stands as its line has it", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    await begun(a)
    const before = relay.kept().length
    await a.show()
    await a.read()
    expect(relay.kept().length).toBe(before)
  })

  test("makes its day's line to be kept as a passing one, said only by the entries that make it", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    await begun(a)
    await a.drafts.updateDraft({ ...DRAFT, log: logOf(2) }, DRAFT.log)
    a.clock.now = "2026-10-28T02:00:04.000Z"
    await a.show()
    expect(relay.keeps()).toEqual([{ after: 0, keep: "passing" }, { after: 1, keep: undefined }])
  })

  test("goes to no line when its book is not one the device syncs as its owner", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A, [BOOK])
    await begun(a, { ...DRAFT, bookId: OTHER_BOOK })
    expect(relay.kept()).toEqual([])
  })
})

describe("continuing a play on another device", () => {
  test("claims it, takes it up as the holder last showed it, and the old holder gives it up", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    await b.read()
    const taken = unwrapped(await continueHere(b.ports, PLAY))
    expect(taken.log).toBe(logOf(1))
    expect(await hold(b)).toEqual(["held", logOf(1)])
    const yielded = await a.read()
    expect(yielded).toEqual([expect.objectContaining({ type: "yield-up", playId: PLAY, unshown: 0 })])
    expect(await hold(a)).toEqual(["followed", logOf(1)])
    expect(await holderOn(relay)).toBe(B)
  })

  test("weighed again when the line moved on under the claim, continues from the newest showing", async () => {
    const base = memoryRelay()
    const a = await deviceOn(base, A)
    await begun(a)
    const raced = { done: false }
    const racing: Relay = {
      ...base,
      append: async (access, after, entries) => {
        if (!raced.done) {
          raced.done = true
          await a.drafts.updateDraft({ ...DRAFT, log: logOf(3) }, DRAFT.log)
          await a.show()
        }
        return base.append(access, after, entries)
      },
    }
    const b = await deviceOn(racing, B)
    await b.read()
    expect(await hold(b)).toEqual(["followed", logOf(1)])
    unwrapped(await continueHere(b.ports, PLAY))
    expect(raced.done).toBe(true)
    expect(await hold(b)).toEqual(["held", logOf(3)])
    expect(await holderOn(base)).toBe(B)
  })

  test("pressed on two devices at once leaves it held on one, the one that claimed last", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    const c = await deviceOn(relay, C)
    await begun(a)
    await b.read()
    await c.read()
    await Promise.all([continueHere(b.ports, PLAY), continueHere(c.ports, PLAY)])
    await a.read()
    await b.read()
    await c.read()
    const holder = await holderOn(relay)
    expect(holder === B || holder === C).toBe(true)
    const holds = await Promise.all([a, b, c].map(async (device) => (await hold(device))?.[0]))
    expect(holds.filter((kind) => kind === "held")).toHaveLength(1)
    expect(holds[holder === B ? 1 : 2]).toBe("held")
  })

  test("leaves the old holder, come back with readings of its own, the line's play and a count of what it lost", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    await b.read()
    unwrapped(await continueHere(b.ports, PLAY))
    const before = relay.kept().length
    await a.drafts.updateDraft({ ...DRAFT, log: logOf(3) }, DRAFT.log)
    const acted = await a.show()
    expect(acted).toEqual([expect.objectContaining({ type: "yield-up", playId: PLAY, unshown: 2 })])
    expect(await hold(a)).toEqual(["followed", logOf(1)])
    expect(relay.kept().length).toBe(before)
    expect(await hold(b)).toEqual(["held", logOf(1)])
  })

  test("cannot be done where the relay cannot be reached", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    await begun(a)
    const b = await deviceOn({ ...relay, entriesAfter: async () => Err({ type: "unreachable", detail: "offline" }) }, B)
    await b.follow.putFollowed({ id: PLAY, play: playAt(1), holder: A, shownAt: "2026-10-28T02:00:00.000Z", line: { bookId: BOOK, day: TODAY } })
    expect(await continueHere(b.ports, PLAY)).toEqual({ ok: false, error: { type: "sync", problem: { type: "unreachable", detail: "offline" } } })
    expect(await hold(b)).toEqual(["followed", logOf(1)])
  })
})

describe("a play its holder", () => {
  test("deleted is taken off the line, and the copies of it let go", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    await b.read()
    await a.drafts.deleteDraft(PLAY)
    await a.read()
    expect(kinds(await b.read())).toEqual(["drop-followed"])
    expect(await hold(b)).toBeUndefined()
  })

  test("records into another book is taken off the first book's line and shown on the other's", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A, [BOOK, OTHER_BOOK])
    const b = await deviceOn(relay, B, [BOOK])
    const c = await deviceOn(relay, C, [BOOK, OTHER_BOOK])
    await begun(a, { ...DRAFT, bookId: BOOK })
    await b.read()
    await c.read()
    await a.drafts.updateDraft({ ...DRAFT, bookId: OTHER_BOOK }, DRAFT.log)
    await a.read()
    await a.show()
    expect(kinds(await b.read())).toEqual(["drop-followed"])
    expect(await hold(b)).toBeUndefined()
    await c.read()
    const copy = unwrapped(await c.follow.readFollowed(PLAY))
    expect([copy?.line.bookId, copy?.play.bookId]).toEqual([OTHER_BOOK, OTHER_BOOK])
  })

  test("left over from a day gone by is shown again on the business day's line", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    a.clock.day = YESTERDAY
    await begun(a, { ...DRAFT, date: YESTERDAY })
    a.clock.day = TODAY
    await a.read()
    await a.show()
    const b = await deviceOn(relay, B)
    await b.read()
    const copy = unwrapped(await b.follow.readFollowed(PLAY))
    expect([copy?.holder, copy?.line.day]).toEqual([A, TODAY])
    expect(a.held.lines.find((line) => line.day === TODAY)?.entries.map(({ entry }) => entry.type)).toEqual(["shown"])
  })
})

describe("recording a play", () => {
  test("goes ahead on the device that holds it, and is refused on one whose play was claimed since, which gives it up", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    expect(await heldBeforeFinishing(a.ports, DRAFT)).toEqual({ ok: true, value: undefined })
    await b.read()
    unwrapped(await continueHere(b.ports, PLAY))
    expect(await heldBeforeFinishing(a.ports, DRAFT)).toEqual({ ok: false, error: { type: "draft", error: { type: "held-elsewhere", playId: PLAY } } })
    expect(await hold(a)).toEqual(["followed", logOf(1)])
  })

  test("goes ahead where the relay cannot be reached: the device's own word stands", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    await b.read()
    unwrapped(await continueHere(b.ports, PLAY))
    const offline: PlayLinePorts = { ...a.ports, relay: { ...relay, entriesAfter: async () => Err({ type: "unreachable", detail: "offline" }) } }
    expect(await heldBeforeFinishing(offline, DRAFT)).toEqual({ ok: true, value: undefined })
    expect(await hold(a)).toEqual(["held", logOf(1)])
  })
})

describe("the day's copies", () => {
  test("let go of one recorded on a day gone by", async () => {
    const relay = memoryRelay()
    const b = await deviceOn(relay, B)
    const recorded = { ...playAt(1), date: YESTERDAY, recorded: { at: "2026-10-27T12:00:00.000Z", finish: { at: "2026-10-27T11:50:00.000Z", counter: 300 } } }
    await b.follow.putFollowed({ id: PLAY, play: recorded, holder: A, shownAt: "2026-10-27T12:00:00.000Z", line: { bookId: BOOK, day: YESTERDAY } })
    expect(await loadFollowedToday(b.follow, TODAY)).toEqual({ ok: true, value: [] })
    expect(await b.follow.listFollowed()).toEqual({ ok: true, value: [] })
  })
})

describe("a play sent to a book", () => {
  test("waits on the inbox while this device only follows it, and is taken in once the device holds it", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    await b.read()
    const keys = unwrapped(await sealer.inboxKeysOf(SECRETS[BOOK] ?? ""))
    const box = unwrapped(await sealer.seal(keys, "sent-000000000001", sentDraftText(sentDraftOf(DRAFT, "sender", "2026-10-28T01:30:00.000Z"))))
    unwrapped(await relay.append(accessOf(RELAY_URL, keys), 0, [{ commitId: "sent-000000000001", box }]))
    const invitations = memoryInvitations()
    await invitations.write({ id: "invited", bookId: BOOK, name: "友", role: "sender", invitedAt: "2026-10-28T00:00:00.000Z", code: "not-read-here" })
    const inbox: InboxPorts = { links: b.links, relay, sealer, invitations, drafts: b.drafts, follow: b.follow }

    expect(await receiveArrivals(inbox)).toEqual({ taken: 0, unreadable: 0 })
    expect(await b.drafts.readDraft(PLAY)).toEqual({ ok: false, error: { type: "held-elsewhere", playId: PLAY } })
    expect(unwrapped(await b.links.read(BOOK))?.inboxHandled ?? []).toEqual([])

    unwrapped(await continueHere(b.ports, PLAY))
    expect(await receiveArrivals(inbox)).toEqual({ taken: 1, unreadable: 0 })
    expect(unwrapped(await b.links.read(BOOK))?.inboxHandled).toEqual(["sent-000000000001"])
  })
})

/** Two days before the business day: a claim this old is on a line no device reads any more. */
const DAY_BEFORE_YESTERDAY = "2026-10-26" as IsoDate

/** A friend's sending of the play, the first on the book's inbox. */
const sendingOn = async (relay: Relay, commitId: string, draft: PlayDraft = DRAFT): Promise<void> => {
  const keys = unwrapped(await sealer.inboxKeysOf(SECRETS[BOOK] ?? ""))
  const box = unwrapped(await sealer.seal(keys, commitId, sentDraftText(sentDraftOf(draft, "sender", "2026-10-28T01:30:00.000Z"))))
  unwrapped(await relay.append(accessOf(RELAY_URL, keys), 0, [{ commitId, box }]))
}

const inboxOf = async (relay: Relay, device: Awaited<ReturnType<typeof deviceOn>>): Promise<InboxPorts> => {
  const invitations = memoryInvitations()
  await invitations.write({ id: "invited", bookId: BOOK, name: "友", role: "sender", invitedAt: "2026-10-28T00:00:00.000Z", code: "not-read-here" })
  return { links: device.links, relay, sealer, invitations, drafts: device.drafts, follow: device.follow }
}

/** A book that takes whatever is written into it, and does something first: another device acting while a tally is written. */
const bookDoing = (meanwhile: () => Promise<void>): BookSession =>
  ({
    write: async () => {
      await meanwhile()
      return Ok("commit-000001")
    },
  }) as unknown as BookSession

const YEN_TALLY = { id: PLAY, gameKind: "pachinko", date: TODAY, machine: "made-up", cabinetNumber: undefined, parlor: undefined } as unknown as YenTally

const FINISH = { at: "2026-10-28T03:00:00.000Z", counter: undefined }

describe("a play continued on another device, over the days", () => {
  test("is not taken back by the device claimed from, showing it first on a new day's line without having read the claim", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    a.clock.day = YESTERDAY
    b.clock.day = YESTERDAY
    await begun(a, { ...DRAFT, date: YESTERDAY })
    await b.read()
    unwrapped(await continueHere(b.ports, PLAY))
    a.clock.day = TODAY
    b.clock.day = TODAY
    a.held.lines = []
    await a.show()
    await b.read()
    await b.show()
    await a.read()
    await a.read()
    await b.read()
    expect((await hold(a))?.[0]).toBe("followed")
    expect((await hold(b))?.[0]).toBe("held")
    expect(await holderOn(relay)).toBe(B)
  })

  test("stays with the device that continued it when the device claimed from comes back two days on and shows it first", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    a.clock.day = DAY_BEFORE_YESTERDAY
    b.clock.day = DAY_BEFORE_YESTERDAY
    await begun(a, { ...DRAFT, date: DAY_BEFORE_YESTERDAY })
    await b.read()
    unwrapped(await continueHere(b.ports, PLAY))
    await b.drafts.updateDraft({ ...unwrapped(await b.drafts.readDraft(PLAY)), log: logOf(3) }, logOf(1))
    a.clock.day = TODAY
    b.clock.day = TODAY
    a.held.lines = []
    await a.show()
    expect(kinds(await b.read())).toEqual([])
    expect(await hold(b)).toEqual(["held", logOf(3)])
    await b.show()
    expect(kinds(await a.read())).toEqual(["yield-up"])
    expect(await hold(a)).toEqual(["followed", logOf(3)])
    expect(await holderOn(relay)).toBe(B)
  })
})

describe("a copy put as the play was continued here", () => {
  test("is not kept beside the play taken up, which, deleted, does not come back from it", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    await b.read()
    await a.drafts.updateDraft({ ...DRAFT, log: logOf(2) }, DRAFT.log)
    a.clock.now = "2026-10-28T02:00:04.000Z"
    await a.show()
    const putting: PlayLinePorts = {
      ...b.ports,
      follow: {
        ...b.follow,
        putFollowed: async (followed) => {
          unwrapped(await continueHere(b.ports, PLAY))
          return b.follow.putFollowed(followed)
        },
      },
    }
    unwrapped(await followPlays(putting, unwrapped(await readPlayLines(putting, b.held.lines))))
    expect(await hold(b)).toEqual(["held", logOf(2)])
    expect(await b.follow.listFollowed()).toEqual({ ok: true, value: [] })
    expect(await loadFollowedToday(b.follow, TODAY)).toEqual({ ok: true, value: [] })
    await b.drafts.deleteDraft(PLAY)
    expect(kinds(await b.read())).not.toContain("take-up")
    expect(await hold(b)).toBeUndefined()
  })
})

describe("a play given up", () => {
  test("is not given up while a reading is written as it is weighed: the next reading gives it up, counting that reading", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a)
    await b.read()
    unwrapped(await continueHere(b.ports, PLAY))
    const writing: PlayLinePorts = {
      ...a.ports,
      follow: {
        ...a.follow,
        yieldUp: async (id, followed, previousLog) => {
          unwrapped(await a.drafts.updateDraft({ ...DRAFT, log: logOf(2) }, DRAFT.log))
          return a.follow.yieldUp(id, followed, previousLog)
        },
      },
    }
    const acted = unwrapped(await followPlays(writing, unwrapped(await readPlayLines(writing, a.held.lines)))).acted
    expect(kinds(acted)).toEqual([])
    expect(await hold(a)).toEqual(["held", logOf(2)])
    expect(await a.read()).toEqual([expect.objectContaining({ type: "yield-up", unshown: 1 })])
    expect(await hold(a)).toEqual(["followed", logOf(1)])
  })
})

describe("a play left over from a day gone by", () => {
  test("deleted before it was shown on the business day's line is taken off the line, and its copies let go", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    a.clock.day = YESTERDAY
    b.clock.day = YESTERDAY
    await begun(a, { ...DRAFT, date: YESTERDAY })
    await b.read()
    a.clock.day = TODAY
    b.clock.day = TODAY
    await a.drafts.deleteDraft(PLAY)
    await a.read()
    expect(kinds(await b.read())).toEqual(["drop-followed"])
    expect(await hold(b)).toBeUndefined()
    expect(await continueHere(b.ports, PLAY)).toEqual({ ok: false, error: { type: "draft", error: { type: "draft-missing", playId: PLAY } } })
  })

  test("recorded, is shown recorded before it is let go of, and its copies let go of as recorded, never as deleted", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    a.clock.day = YESTERDAY
    b.clock.day = YESTERDAY
    await begun(a, { ...DRAFT, date: YESTERDAY })
    await b.read()
    a.clock.day = TODAY
    b.clock.day = TODAY
    await a.read()
    await a.show()
    const draft = unwrapped(await a.drafts.readDraft(PLAY))
    unwrapped(await finishingHeld(a.ports).finishPlayInYen(bookDoing(async () => undefined), a.drafts, draft, BOOK, YEN_TALLY, FINISH, "2026-10-28T03:00:00.000Z", undefined))
    unwrapped(await loadTodaysPlays(a.drafts, TODAY))
    expect(await hold(a)).toBeUndefined()
    await a.read()
    await a.show()
    expect(relay.kept().length).toBeGreaterThan(0)
    const standing = standingsOf(unwrapped(await readPlayLines((await deviceOn(relay, C)).ports, []))).get(PLAY)
    expect(standing).toMatchObject({ type: "held", by: A, play: { recorded: { at: "2026-10-28T03:00:00.000Z" } } })
    expect(kinds(await b.read())).toEqual(["drop-followed"])
    expect(await hold(b)).toBeUndefined()
  })
})

describe("recording a play claimed while it is being recorded", () => {
  test("claims it back, as the log the book now has, so the device that claimed it gives it up knowing it recorded", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a, { ...DRAFT, log: logOf(2) })
    await b.read()
    const draft = unwrapped(await a.drafts.readDraft(PLAY))
    const claimedMeanwhile = bookDoing(async () => {
      unwrapped(await continueHere(b.ports, PLAY))
      await a.read()
    })
    const recorded = await finishingHeld(a.ports).finishPlayInYen(claimedMeanwhile, a.drafts, draft, BOOK, YEN_TALLY, FINISH, "2026-10-28T03:00:00.000Z", undefined)
    expect(recorded.ok).toBe(true)
    expect(unwrapped(await a.drafts.readDraft(PLAY)).recorded).toEqual({ at: "2026-10-28T03:00:00.000Z", finish: FINISH })
    await a.show()
    expect(kinds(await b.read())).toEqual(["yield-up"])
    expect(unwrapped(await b.follow.readFollowed(PLAY))?.play.recorded).toEqual({ at: "2026-10-28T03:00:00.000Z", finish: FINISH })
    expect(await holderOn(relay)).toBe(A)
  })
})

describe("a play sent to a book and taken in by the device holding it", () => {
  test("is had by a device following it, and neither taken in again once it continues the play nor brought back once its copy is let go", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await sendingOn(relay, "sent-000000000001")
    expect(await receiveArrivals(await inboxOf(relay, a))).toEqual({ taken: 1, unreadable: 0 })
    const received = unwrapped(await a.drafts.readDraft(PLAY))
    await a.drafts.updateDraft({ ...received, log: logOf(3) }, received.log)
    await a.show()
    await b.read()
    const inbox = await inboxOf(relay, b)
    expect(await receiveArrivals(inbox)).toEqual({ taken: 0, unreadable: 0 })
    expect(unwrapped(await b.links.read(BOOK))?.inboxHandled).toEqual(["sent-000000000001"])
    unwrapped(await continueHere(b.ports, PLAY))
    expect(await receiveArrivals(inbox)).toEqual({ taken: 0, unreadable: 0 })
    expect(unwrapped(await b.drafts.readDraft(PLAY)).received?.again).toBeUndefined()
    expect(await hold(b)).toEqual(["held", logOf(3)])
  })
})

describe("a play its holder records into another book", () => {
  test("is shown on the book it went to before it is taken off the one it left, so a device syncing both never loses it between", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A, [BOOK, OTHER_BOOK])
    const c = await deviceOn(relay, C, [BOOK, OTHER_BOOK])
    await begun(a, { ...DRAFT, bookId: BOOK })
    await c.read()
    const otherLine = unwrapped(await sealer.playsKeysOf(SECRETS[OTHER_BOOK] ?? "", TODAY)).lineId
    const seen: { first: string | undefined; between: readonly string[] } = { first: undefined, between: [] }
    const watching: PlayLinePorts = {
      ...a.ports,
      relay: {
        ...relay,
        append: async (access, after, entries) => {
          const put = await relay.append(access, after, entries)
          if (seen.first === undefined) {
            seen.first = access.lineId
            seen.between = kinds(await c.read())
          }
          return put
        },
      },
    }
    await a.drafts.updateDraft({ ...DRAFT, bookId: OTHER_BOOK }, DRAFT.log)
    a.clock.now = "2026-10-28T02:00:04.000Z"
    unwrapped(await followPlays(watching, unwrapped(await readPlayLines(watching, a.held.lines))))
    expect(seen.first).toBe(otherLine)
    expect(seen.between).not.toContain("drop-followed")
    expect(unwrapped(await c.follow.readFollowed(PLAY))?.line.bookId).toBe(OTHER_BOOK)
    expect(kinds(await c.read())).not.toContain("drop-followed")
  })

  test("is said moved, not deleted, to a device pressing to continue it that does not sync the other book", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A, [BOOK, OTHER_BOOK])
    const b = await deviceOn(relay, B, [BOOK])
    await begun(a, { ...DRAFT, bookId: BOOK })
    await b.read()
    await a.drafts.updateDraft({ ...DRAFT, bookId: OTHER_BOOK }, DRAFT.log)
    await a.read()
    expect(await continueHere(b.ports, PLAY)).toEqual({ ok: false, error: { type: "play-gone", playId: PLAY, reason: "moved" } })
    expect(await hold(b)).toBeUndefined()
  })
})

describe("reading the line of a play being watched", () => {
  test("reads that play's book alone, keeping the other books' lines as they were", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A, [BOOK, OTHER_BOOK])
    await begun(a, { ...DRAFT, bookId: BOOK })
    const counted: { reads: readonly string[] } = { reads: [] }
    const counting: Relay = {
      ...relay,
      entriesAfter: (access, after) => {
        counted.reads = [...counted.reads, access.lineId]
        return relay.entriesAfter(access, after)
      },
    }
    const b = await deviceOn(counting, B, [BOOK, OTHER_BOOK])
    await b.read()
    const otherLines = b.held.lines.filter((line) => line.bookId === OTHER_BOOK)
    counted.reads = []
    const lines = unwrapped(await readPlayLines(b.ports, b.held.lines, { type: "book-of", playId: PLAY }))
    const bookLine = unwrapped(await sealer.playsKeysOf(SECRETS[BOOK] ?? "", TODAY)).lineId
    expect(new Set(counted.reads)).toEqual(new Set([bookLine]))
    expect(lines.filter((line) => line.bookId === OTHER_BOOK)).toEqual(otherLines)
    expect(lines.some((line) => line.bookId === BOOK && line.day === TODAY)).toBe(true)
  })
})

describe("a showing's size", () => {
  test("is reckoned as the sealed body the relay counts, not the packed text: a play packing to under a small body may seal to over one", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const noise = (index: number): number => (index * 7_919 + ((index * index) % 104_729) * 31) % 1_000_003
    const log = `${Array.from({ length: 2_400 }, (_, index) => `{"spins":${noise(index)},"outlay":${noise(index + 17) * 13}}`).join("\n")}\n`
    const large = { ...DRAFT, log }
    const packed = a.ports.packer.pack(JSON.stringify({ format: 1, type: "shown", by: A, at: a.clock.now, play: { ...large, bookId: BOOK } }))
    const keys = unwrapped(await sealer.playsKeysOf(SECRETS[BOOK] ?? "", TODAY))
    const box = unwrapped(await sealer.seal(keys, "0".repeat(36), packed))
    expect(packed.length).toBeLessThan(32_000)
    expect(box.length).toBeGreaterThan(32_000)
    expect(await isLargeShowing(a.ports, [], [large])).toBe(true)
    expect(await isLargeShowing(a.ports, [], [DRAFT])).toBe(false)
  })
})

const linesOfLog = (log: string): readonly string[] => log.split("\n").filter((line) => line !== "")

/** A log of `count` readings, as long as a play typed into all evening, each spin count as uneven as a real one's. */
const longLog = (count: number): string => `${Array.from({ length: count }, (_, index) => `{"spins":${index * 20 + ((index * 7_919) % 19)},"outlay":${index * 1000}}`).join("\n")}\n`

/** The play a device holds, as any device reads it off a line. */
const shownAsHeld = async (device: Awaited<ReturnType<typeof deviceOn>>): Promise<ShownPlay | undefined> =>
  readShownPlay(JSON.parse(JSON.stringify(shownPlayOf(unwrapped(await device.drafts.readDraft(PLAY)), BOOK))))

/** The play's next reading, written on a device that holds it and shown four seconds on. */
const readingShown = async (device: Awaited<ReturnType<typeof deviceOn>>, count: number): Promise<void> => {
  const draft = unwrapped(await device.drafts.readDraft(PLAY))
  unwrapped(await device.drafts.updateDraft({ ...draft, log: longLog(count) }, draft.log))
  device.clock.now = new Date(Date.parse(device.clock.now) + 4_000).toISOString()
  await device.show()
}

const typesOnToday = (device: Awaited<ReturnType<typeof deviceOn>>): readonly string[] => device.held.lines.find((line) => line.day === TODAY)?.entries.map(({ entry }) => entry.type) ?? []

const followedPlay = async (device: Awaited<ReturnType<typeof deviceOn>>): Promise<ShownPlay | undefined> => {
  const copy = unwrapped(await device.follow.readFollowed(PLAY))
  return copy?.play
}

describe("a play shown again and again", () => {
  test("goes whole and then as patches, and a device following it from them has the play as its holder has it", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a, { ...DRAFT, log: longLog(1) })
    await b.read()
    await [2, 3, 4, 5].reduce(async (before, count) => {
      await before
      await readingShown(a, count)
      if (count % 2 === 0) await b.read()
    }, Promise.resolve())
    await b.read()
    expect(typesOnToday(a)).toEqual(["shown", "patched", "patched", "patched", "patched"])
    expect(await followedPlay(b)).toEqual(await shownAsHeld(a))
    expect(standingsOf(b.held.lines).get(PLAY)).toMatchObject({ type: "held", by: A, shownAt: a.clock.now })
  })

  test("missed by a device that could not open one patch: it keeps its copy until the play is next shown whole", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const unopened: Relay = {
      ...relay,
      entriesAfter: async (access, after) => {
        const read = await relay.entriesAfter(access, after)
        return read.ok ? Ok({ ...read.value, entries: read.value.entries.map((entry) => (entry.seq === 2 ? { ...entry, box: "unopenable" } : entry)) }) : read
      },
    }
    const b = await deviceOn(unopened, B)
    await begun(a, { ...DRAFT, log: longLog(1) })
    await readingShown(a, 2)
    await readingShown(a, 3)
    await b.read()
    expect((await followedPlay(b))?.log).toBe(longLog(1))
    await Array.from({ length: 17 }, (_, index) => index + 4).reduce(async (before, count) => {
      await before
      await readingShown(a, count)
    }, Promise.resolve())
    await b.read()
    expect((await followedPlay(b))?.log).toBe(longLog(1))
    await readingShown(a, 21)
    expect(typesOnToday(a).at(-1)).toBe("shown")
    await b.read()
    expect(await followedPlay(b)).toEqual(await shownAsHeld(a))
  })

  test("claimed after patches, is taken up as last patched, shown whole by its new holder, and patched by it after", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a, { ...DRAFT, log: longLog(1) })
    await readingShown(a, 2)
    await readingShown(a, 3)
    await b.read()
    const taken = unwrapped(await continueHere(b.ports, PLAY))
    expect(taken.log).toBe(longLog(3))
    await b.read()
    expect(typesOnToday(b)).toEqual(["shown", "patched", "patched", "claimed", "shown"])
    expect(await a.read()).toEqual([expect.objectContaining({ type: "yield-up", playId: PLAY, unshown: 0 })])
    await readingShown(b, 4)
    expect(typesOnToday(b).at(-1)).toBe("patched")
    await a.read()
    expect(await followedPlay(a)).toEqual(await shownAsHeld(b))
    expect((await followedPlay(a))?.handovers).toBe(1)
  })

  test("of two hundred readings, goes as patches far smaller than the play shown whole", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const history = linesOfLog(longLog(200)).slice(1).map((reading, index) => ({ at: new Date(Date.parse(DRAFT.startedAt) + index * 60_000).toISOString(), removed: [], added: [reading] }))
    await begun(a, { ...DRAFT, log: longLog(200), history })
    await readingShown(a, 201)
    await readingShown(a, 202)
    const [whole, ...patches] = relay.kept().map((entry) => entry.box.length)
    expect(typesOnToday(a)).toEqual(["shown", "patched", "patched"])
    expect(patches.every((size) => size * 10 < (whole ?? 0))).toBe(true)
    expect(await isLargeShowing(a.ports, a.held.lines, [{ ...DRAFT, log: longLog(203) }])).toBe(false)
  })
})

describe("a play claimed while its holder records it, the mark going through", () => {
  test("is held again by the device that recorded it, which the device that claimed it gives up to knowing it was recorded", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    await begun(a, { ...DRAFT, log: logOf(2) })
    await b.read()
    const draft = unwrapped(await a.drafts.readDraft(PLAY))
    const claimedMeanwhile = bookDoing(async () => {
      unwrapped(await continueHere(b.ports, PLAY))
    })
    unwrapped(await finishingHeld(a.ports).finishPlayInYen(claimedMeanwhile, a.drafts, draft, BOOK, YEN_TALLY, FINISH, "2026-10-28T03:00:00.000Z", undefined))
    expect(kinds(await a.show())).toEqual(["claim-back"])
    expect(await hold(a)).toEqual(["held", logOf(2)])
    expect(unwrapped(await a.drafts.readDraft(PLAY)).handovers).toBe(2)
    expect(kinds(await b.read())).toEqual(["yield-up"])
    expect(unwrapped(await b.follow.readFollowed(PLAY))?.play.recorded).toEqual({ at: "2026-10-28T03:00:00.000Z", finish: FINISH })
    expect(await holderOn(relay)).toBe(A)
  })
})

describe("a play continued on another device and ended there, its first holder back days later", () => {
  const continuedTwoDaysAgo = async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    const b = await deviceOn(relay, B)
    a.clock.day = DAY_BEFORE_YESTERDAY
    b.clock.day = DAY_BEFORE_YESTERDAY
    await begun(a, { ...DRAFT, date: DAY_BEFORE_YESTERDAY })
    await b.read()
    unwrapped(await continueHere(b.ports, PLAY))
    return { relay, a, b }
  }

  const backToday = async (a: Awaited<ReturnType<typeof deviceOn>>, b: Awaited<ReturnType<typeof deviceOn>>): Promise<void> => {
    a.clock.day = TODAY
    b.clock.day = TODAY
    a.held.lines = []
  }

  test("recorded there, is given up on the first holder as recorded, never shown again for the other to take back", async () => {
    const { relay, a, b } = await continuedTwoDaysAgo()
    const draft = unwrapped(await b.drafts.readDraft(PLAY))
    unwrapped(await finishingHeld(b.ports).finishPlayInYen(bookDoing(async () => undefined), b.drafts, draft, BOOK, YEN_TALLY, FINISH, "2026-10-26T03:00:00.000Z", undefined))
    await b.show()
    await backToday(a, b)
    unwrapped(await loadTodaysPlays(b.drafts, TODAY))
    await b.read()
    await b.show()
    expect(kinds(await a.read())).toEqual(["yield-up"])
    await a.show()
    expect(unwrapped(await loadFollowedToday(a.follow, TODAY))).toEqual([])
    expect(await hold(a)).toBeUndefined()
    expect(kinds(await b.read())).toEqual([])
    expect(await hold(b)).toBeUndefined()
    expect(await holderOn(relay)).toBeUndefined()
  })

  test("deleted there, is never shown again by the first holder for the other to take back", async () => {
    const { a, b } = await continuedTwoDaysAgo()
    await b.drafts.deleteDraft(PLAY)
    await b.read()
    await backToday(a, b)
    await a.read()
    await a.show()
    expect(kinds(await b.read())).toEqual([])
    expect(await hold(b)).toBeUndefined()
  })

  test("is not recorded by the first holder: its own day's line is read, and the claim found there", async () => {
    const { a, b } = await continuedTwoDaysAgo()
    await backToday(a, b)
    const draft = unwrapped(await a.drafts.readDraft(PLAY))
    expect(await heldBeforeFinishing(a.ports, draft)).toEqual({ ok: false, error: { type: "draft", error: { type: "held-elsewhere", playId: PLAY } } })
    expect((await hold(a))?.[0]).toBe("followed")
  })
})

describe("a play its holder moves to another book as another device claims it", () => {
  test("stays with the device that claimed it, the later handover standing over the later clock", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A, [BOOK, OTHER_BOOK])
    const b = await deviceOn(relay, B, [BOOK, OTHER_BOOK])
    await begun(a, { ...DRAFT, bookId: BOOK })
    await b.read()
    b.clock.now = "2026-10-28T02:00:05.000Z"
    unwrapped(await continueHere(b.ports, PLAY))
    a.clock.now = "2026-10-28T02:00:09.000Z"
    const mine = unwrapped(await a.drafts.readDraft(PLAY))
    unwrapped(await a.drafts.updateDraft({ ...mine, bookId: OTHER_BOOK }, mine.log))
    await a.show()
    await a.read()
    await b.read()
    expect((await hold(a))?.[0]).toBe("followed")
    expect((await hold(b))?.[0]).toBe("held")
  })
})

describe("a device that syncs no book of its own", () => {
  test("reads no book to read, follow or show its plays", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A, [])
    const counted: { books: number } = { books: 0 }
    const counting: PlayLinePorts = {
      ...a.ports,
      books: async () => {
        counted.books += 1
        return Ok([])
      },
    }
    await a.drafts.createDraft(DRAFT)
    const lines = unwrapped(await readPlayLines(counting, []))
    unwrapped(await followPlays(counting, lines))
    unwrapped(await showHeldPlays(counting, lines))
    await flushOnHide(counting, lines)
    expect(counted.books).toBe(0)
    expect(relay.kept()).toEqual([])
  })
})

describe("recording a play of the day on a synced book", () => {
  test("waits on one reading of its lines, all at once, and nothing after the book is written", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    await begun(a)
    const seen: { reading: number; most: number; written: boolean; after: number; appended: number } = { reading: 0, most: 0, written: false, after: 0, appended: 0 }
    const watched: Relay = {
      ...relay,
      entriesAfter: async (access, after) => {
        seen.reading += 1
        seen.most = Math.max(seen.most, seen.reading)
        if (seen.written) seen.after += 1
        await new Promise((resolve) => setTimeout(resolve, 20))
        const read = await relay.entriesAfter(access, after)
        seen.reading -= 1
        return read
      },
      append: async (access, after, entries) => {
        seen.appended += 1
        return relay.append(access, after, entries)
      },
    }
    const draft = unwrapped(await a.drafts.readDraft(PLAY))
    const writing = bookDoing(async () => {
      seen.written = true
    })
    unwrapped(await finishingHeld({ ...a.ports, relay: watched }).finishPlayInYen(writing, a.drafts, draft, BOOK, YEN_TALLY, FINISH, "2026-10-28T03:00:00.000Z", undefined))
    expect(seen.most).toBeGreaterThan(1)
    expect([seen.after, seen.appended]).toEqual([0, 0])
  })
})

describe("a play being watched, its holder moving it to another book this device syncs", () => {
  test("is followed onto that book, never let go as moved off", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A, [BOOK, OTHER_BOOK])
    const b = await deviceOn(relay, B, [BOOK, OTHER_BOOK])
    await begun(a, { ...DRAFT, bookId: BOOK })
    await b.read()
    await a.drafts.updateDraft({ ...DRAFT, bookId: OTHER_BOOK }, DRAFT.log)
    a.clock.now = "2026-10-28T02:00:04.000Z"
    await a.read()
    const lines = unwrapped(await readPlayLines(b.ports, b.held.lines, { type: "book-of", playId: PLAY }))
    const acted = unwrapped(await followPlays(b.ports, lines)).acted
    expect(kinds(acted)).toEqual(["put-followed"])
    expect(unwrapped(await b.follow.readFollowed(PLAY))?.line.bookId).toBe(OTHER_BOOK)
  })
})

describe("a play recorded on a day gone by and still on its device", () => {
  test("is not shown again on the business day's line", async () => {
    const relay = memoryRelay()
    const a = await deviceOn(relay, A)
    a.clock.day = YESTERDAY
    await begun(a, { ...DRAFT, date: YESTERDAY })
    const draft = unwrapped(await a.drafts.readDraft(PLAY))
    unwrapped(await finishingHeld(a.ports).finishPlayInYen(bookDoing(async () => undefined), a.drafts, draft, BOOK, { ...YEN_TALLY, date: YESTERDAY }, FINISH, "2026-10-27T03:00:00.000Z", undefined))
    await a.show()
    const before = relay.kept().length
    a.clock.day = TODAY
    await a.read()
    await a.show()
    expect(relay.kept().length).toBe(before)
    expect((await hold(a))?.[0]).toBe("held")
  })
})
