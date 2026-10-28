import { beforeEach, describe, expect, test } from "bun:test"

import type { Followed } from "../../src/core/play-line/following"
import { createConnection, DEVICE, DRAFTS, type Connection } from "../../src/storage/browser/database"
import { createBrowserDeviceData } from "../../src/storage/browser/device-data"
import { createIndexedDbDrafts, createIndexedDbFollow } from "../../src/storage/browser/indexed-db"
import { createIndexedDbDevice } from "../../src/storage/browser/indexed-db-device"
import { memoryIndexedDb } from "../support/memory-indexed-db"
import { A, BOOK, DRAFT, PLAY, TODAY, playAt } from "../support/play-line"

const COPY: Followed = { id: PLAY, play: playAt(3), holder: A, shownAt: "2026-10-28T02:00:00.000Z", line: { bookId: BOOK, day: TODAY } }

const held: { connection: Connection } = { connection: createConnection() }

beforeEach(() => {
  globalThis.indexedDB = memoryIndexedDb()
  held.connection = createConnection()
})

const stores = () => ({ drafts: createIndexedDbDrafts(held.connection), follow: createIndexedDbFollow(held.connection) })

const rawDraft = async (value: unknown): Promise<void> => {
  const database = await held.connection()
  if (!database.ok) throw new Error("expected a database")
  const transaction = database.value.transaction(DRAFTS, "readwrite")
  transaction.objectStore(DRAFTS).put(value)
  await new Promise((settle) => (transaction.oncomplete = settle))
}

describe("a play another device holds", () => {
  test("is no play this device holds: reading or writing it says it is held elsewhere", async () => {
    const { drafts, follow } = stores()
    expect(await follow.putFollowed(COPY)).toEqual({ ok: true, value: undefined })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: false, error: { type: "held-elsewhere", playId: PLAY } })
    expect(await drafts.updateDraft({ ...DRAFT, log: playAt(4).log }, DRAFT.log)).toEqual({ ok: false, error: { type: "held-elsewhere", playId: PLAY } })
    expect(await follow.readFollowed(PLAY)).toEqual({ ok: true, value: COPY })
  })

  test("that the device keeps nothing of is missing, as before", async () => {
    const { drafts } = stores()
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: false, error: { type: "draft-missing", playId: PLAY } })
    expect(await drafts.updateDraft(DRAFT, DRAFT.log)).toEqual({ ok: false, error: { type: "draft-missing", playId: PLAY } })
  })

  test("is listed, and let go of", async () => {
    const { follow } = stores()
    await follow.putFollowed(COPY)
    expect(await follow.listFollowed()).toEqual({ ok: true, value: [COPY] })
    await follow.dropFollowed(PLAY)
    expect(await follow.listFollowed()).toEqual({ ok: true, value: [] })
    expect(await follow.readFollowed(PLAY)).toEqual({ ok: true, value: undefined })
  })
})

describe("taking a play up", () => {
  test("lets the copy go and keeps the play as this device's own, its history as the line had it", async () => {
    const { drafts, follow } = stores()
    const withHistory: Followed = { ...COPY, play: { ...COPY.play, history: [{ at: "2026-10-28T01:30:00.000Z", removed: [], added: ['{"spins":20,"outlay":1000}'] }] } }
    await follow.putFollowed(withHistory)
    expect(await follow.takeUp(withHistory)).toEqual({ ok: true, value: withHistory.play })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: true, value: withHistory.play })
    expect(await follow.listFollowed()).toEqual({ ok: true, value: [] })
  })

  test("changes nothing where it cannot be done whole: a held play that does not read leaves the copy where it was", async () => {
    const { follow } = stores()
    await follow.putFollowed(COPY)
    await rawDraft({ id: PLAY, broken: true })
    expect(await follow.takeUp(COPY)).toEqual({ ok: false, error: { type: "unreadable", kept: "draft" } })
    expect(await follow.listFollowed()).toEqual({ ok: true, value: [COPY] })
  })
})

describe("yielding a play up", () => {
  test("lets the play go and keeps the line's copy in its place", async () => {
    const { drafts, follow } = stores()
    await drafts.createDraft(DRAFT)
    expect(await follow.yieldUp(PLAY, COPY, DRAFT.log)).toEqual({ ok: true, value: undefined })
    expect(await drafts.listDrafts()).toEqual({ ok: true, value: [] })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: false, error: { type: "held-elsewhere", playId: PLAY } })
    expect(await follow.listFollowed()).toEqual({ ok: true, value: [COPY] })
  })

  test("is refused, and changes nothing, where a reading was written since it was weighed: the reading is not lost uncounted", async () => {
    const { drafts, follow } = stores()
    await drafts.createDraft(DRAFT)
    await drafts.updateDraft({ ...DRAFT, log: playAt(2).log }, DRAFT.log)
    expect(await follow.yieldUp(PLAY, COPY, DRAFT.log)).toEqual({ ok: false, error: { type: "changed-elsewhere", path: PLAY } })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: true, value: { ...DRAFT, log: playAt(2).log } })
    expect(await follow.listFollowed()).toEqual({ ok: true, value: [] })
  })
})

describe("a play claimed back", () => {
  test("is held at the handover given, all else as it was", async () => {
    const { drafts, follow } = stores()
    await drafts.createDraft(DRAFT)
    expect(await follow.claimBack(PLAY, 2, DRAFT.log)).toEqual({ ok: true, value: undefined })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: true, value: { ...DRAFT, handovers: 2 } })
  })

  test("is refused, and changes nothing, where a reading was written since it was weighed, or the play is not held here", async () => {
    const { drafts, follow } = stores()
    await drafts.createDraft(DRAFT)
    await drafts.updateDraft({ ...DRAFT, log: playAt(2).log }, DRAFT.log)
    expect(await follow.claimBack(PLAY, 2, DRAFT.log)).toEqual({ ok: false, error: { type: "changed-elsewhere", path: PLAY } })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: true, value: { ...DRAFT, log: playAt(2).log } })
    await drafts.deleteDraft(PLAY)
    expect(await follow.claimBack(PLAY, 2, playAt(2).log)).toEqual({ ok: false, error: { type: "draft-missing", playId: PLAY } })
  })
})

describe("a copy put", () => {
  test("of a play this device holds is not kept: one taken up while the copy was on its way stays held, and in one store alone", async () => {
    const { drafts, follow } = stores()
    await drafts.createDraft(DRAFT)
    expect(await follow.putFollowed(COPY)).toEqual({ ok: true, value: undefined })
    expect(await follow.listFollowed()).toEqual({ ok: true, value: [] })
    await drafts.deleteDraft(PLAY)
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: false, error: { type: "draft-missing", playId: PLAY } })
  })
})

describe("a play's handovers", () => {
  test("are kept by the store through a write of the play from elsewhere, and set by taking the play up", async () => {
    const { drafts, follow } = stores()
    await follow.putFollowed({ ...COPY, play: { ...COPY.play, handovers: 2 } })
    await follow.takeUp({ ...COPY, play: { ...COPY.play, handovers: 2 } })
    expect(await drafts.updateDraft({ ...DRAFT, log: playAt(4).log }, COPY.play.log)).toEqual({ ok: true, value: undefined })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: true, value: { ...DRAFT, log: playAt(4).log, handovers: 2 } })
    expect(await drafts.updateDraft({ ...DRAFT, log: playAt(1).log, handovers: 5 }, playAt(4).log)).toEqual({ ok: true, value: undefined })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: true, value: { ...DRAFT, log: playAt(1).log, handovers: 2 } })
  })
})

describe("a copy kept", () => {
  test("that does not read as one says so", async () => {
    const { follow } = stores()
    await follow.putFollowed({ ...COPY, holder: "" as typeof A })
    expect(await follow.listFollowed()).toEqual({ ok: false, error: { type: "unreadable", kept: "followed" } })
  })

  test("goes with everything else when the device is emptied", async () => {
    const { drafts, follow } = stores()
    await follow.putFollowed(COPY)
    await drafts.createDraft({ ...DRAFT, id: "p-2" as typeof PLAY })
    expect(await createBrowserDeviceData(held.connection).clear()).toEqual({ ok: true, value: undefined })
    expect(await follow.listFollowed()).toEqual({ ok: true, value: [] })
    expect(await drafts.listDrafts()).toEqual({ ok: true, value: [] })
  })
})

describe("a device's ids", () => {
  test("are one for the catalog and another for its plays' lines, each made once and kept", async () => {
    const made: { count: number } = { count: 0 }
    const newId = () => `id-${(made.count += 1)}`
    const catalog = createIndexedDbDevice(held.connection, "catalog", newId)
    const playLine = createIndexedDbDevice(held.connection, "play-line", newId)
    expect([await catalog(), await playLine(), await catalog(), await playLine()]).toEqual(["id-1", "id-2", "id-1", "id-2"])
  })

  test("keep the catalog's where it was kept before the plays' lines had one", async () => {
    const database = await held.connection()
    if (!database.ok) throw new Error("expected a database")
    const transaction = database.value.transaction(DEVICE, "readwrite")
    transaction.objectStore(DEVICE).put({ key: "device", id: "kept-before" })
    await new Promise((settle) => (transaction.oncomplete = settle))
    expect(await createIndexedDbDevice(held.connection, "catalog", () => "fresh")()).toBe("kept-before")
    expect(await createIndexedDbDevice(held.connection, "play-line", () => "fresh")()).toBe("fresh")
  })
})
