import { beforeEach, describe, expect, test } from "bun:test"

import type { PachinkoDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { createConnection, DEVICE, type Connection } from "../../src/storage/browser/database"
import { createIndexedDbDrafts } from "../../src/storage/browser/indexed-db"
import { createIndexedDbDevice } from "../../src/storage/browser/indexed-db-device"
import { memoryIndexedDb } from "../support/memory-indexed-db"

const PLAY = "p-1" as PlayId

const DRAFT: PachinkoDraft = {
  id: PLAY,
  date: "2026-10-28" as IsoDate,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: undefined,
  startedAt: "2026-10-28T01:00:00.000Z",
  log: '{"spins":0,"outlay":0}\n',
}

const held: { connection: Connection } = { connection: createConnection() }

beforeEach(() => {
  globalThis.indexedDB = memoryIndexedDb()
  held.connection = createConnection()
})

describe("a play the device keeps", () => {
  test("is read and written in its own store alone", async () => {
    const drafts = createIndexedDbDrafts(held.connection)
    expect(await drafts.createDraft(DRAFT)).toEqual({ ok: true, value: undefined })
    const later = { ...DRAFT, log: `${DRAFT.log}{"spins":30,"outlay":1000}\n` }
    expect(await drafts.updateDraft(later, DRAFT.log)).toEqual({ ok: true, value: undefined })
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: true, value: later })
  })

  test("is missing where the device keeps none", async () => {
    const drafts = createIndexedDbDrafts(held.connection)
    expect(await drafts.readDraft(PLAY)).toEqual({ ok: false, error: { type: "draft-missing", playId: PLAY } })
    expect(await drafts.updateDraft(DRAFT, DRAFT.log)).toEqual({ ok: false, error: { type: "draft-missing", playId: PLAY } })
  })

  test("is not written over where a reading was written since it was read", async () => {
    const drafts = createIndexedDbDrafts(held.connection)
    await drafts.createDraft(DRAFT)
    expect(await drafts.updateDraft(DRAFT, "another log\n")).toEqual({ ok: false, error: { type: "changed-elsewhere", path: PLAY } })
  })
})

describe("the database", () => {
  test("keeps none of the stores the relay the app once had kept", async () => {
    const database = await held.connection()
    if (!database.ok) throw new Error("expected a database")
    expect(["sync-links", "invitations", "destinations", "followed"].filter((name) => database.value.objectStoreNames.contains(name))).toEqual([])
  })
})

describe("a device's id", () => {
  test("is made once and kept", async () => {
    const made: { count: number } = { count: 0 }
    const catalog = createIndexedDbDevice(held.connection, "catalog", () => `id-${(made.count += 1)}`)
    expect([await catalog(), await catalog()]).toEqual(["id-1", "id-1"])
  })

  test("is the one kept before, where one was", async () => {
    const database = await held.connection()
    if (!database.ok) throw new Error("expected a database")
    const transaction = database.value.transaction(DEVICE, "readwrite")
    transaction.objectStore(DEVICE).put({ key: "device", id: "kept-before" })
    await new Promise((settle) => (transaction.oncomplete = settle))
    expect(await createIndexedDbDevice(held.connection, "catalog", () => "fresh")()).toBe("kept-before")
  })
})
