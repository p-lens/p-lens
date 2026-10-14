import { describe, expect, test } from "bun:test"

import { backUpToFile, backUpToStore, type BackupPorts, bookStandings, removeStoredBackup, restoreChosenFromStore, restoreFromFile, restoreFromStore, storedBackups } from "../../src/application/backup"
import { createBookSession } from "../../src/application/book-session"
import type { HandoverFailure } from "../../src/backup/port/handover"
import { createWebCryptoDigest } from "../../src/backup/web-crypto/web-crypto-digest"
import { createZipArchiver } from "../../src/backup/zip/zip-archiver"
import { MANIFEST_PATH } from "../../src/core/backup/archive"
import type { BookId, Member, MemberId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { dec } from "../support/values"
import { appendEntry, BOOK_FILES } from "../../src/core/journal/layout"
import { Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { memoryBackupStore, memoryHandover, memoryReceipts } from "../support/backup"
import { fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const BOOK = "kept" as BookId

const entry = (date: string, yen: number, note: string): string => `${date} ${note}\n    資産:現金                        -${yen} JPY\n    費用:貸玉差額                    ${yen} JPY`

/** A device of its own: its storage, its hledger, its receipts and what it was handed — with a clock the test moves. */
const device = async (name: string, failing?: HandoverFailure) => {
  const storage = memoryStorage()
  const ids = { next: 0 }
  const history = createMemoryHistory(() => `${name}-commit-${String((ids.next += 1)).padStart(6, "0")}`)
  const me: Member = { id: "local" as MemberId, displayName: name, role: "owner" }
  const clock = { now: "2026-10-07T03:00:00.000Z" }
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date(clock.now), newId: () => crypto.randomUUID(), member: me.id })
  const handover = memoryHandover(failing)
  const ports: BackupPorts = {
    storage,
    session,
    archiver: createZipArchiver(),
    digest: createWebCryptoDigest(),
    receipts: memoryReceipts(),
    handover,
    me,
    now: () => clock.now,
    today: () => "2026-10-07" as IsoDate,
  }
  const record = (date: string, yen: number, note: string) =>
    session.write(BOOK, async (_journal, stored) =>
      Ok({
        files: { ...stored.files, [BOOK_FILES.transactions]: appendEntry(stored.files[BOOK_FILES.transactions] ?? "", entry(date, yen, note)) },
        intent: { type: "pool-opened", parlor: note, tier: "4円", date: "2026-10-01" as IsoDate, rate: dec("4") },
      }),
    )
  return { ports, session, storage, history, handover, record, clock, standing: async () => ((standings) => (standings.ok ? standings.value.map((each) => each.standing.type) : standings.error))(await bookStandings(ports)) }
}

const withBook = async (name: string, failing?: HandoverFailure) => {
  const made = await device(name, failing)
  await made.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [made.ports.me] }))
  return made
}

describe("a book backed up to a store", () => {
  test("stands as never backed up until it is, kept once it is, and changed once it is written to", async () => {
    const here = await withBook("here")
    const store = memoryBackupStore(here.ports.now)
    expect(await here.standing()).toEqual(["never"])

    const receipt = await backUpToStore(here.ports, store, BOOK)
    expect(receipt.ok && { destination: receipt.value.destination, at: receipt.value.at }).toEqual({ destination: "google-drive", at: "2026-10-07T03:00:00.000Z" })
    expect(await here.standing()).toEqual(["kept"])

    expect((await here.record("2026-10-08", 1000, "あとから")).ok).toBe(true)
    expect(await here.standing()).toEqual(["changed"])

    expect((await backUpToStore(here.ports, store, BOOK)).ok).toBe(true)
    expect(await here.standing()).toEqual(["kept"])
  })

  test("goes under its book's id, by its title, and holds the files as they are with a manifest", async () => {
    const here = await withBook("here")
    const store = memoryBackupStore(here.ports.now)
    await backUpToStore(here.ports, store, BOOK)
    const listed = await store.list()
    const [backup] = listed.ok ? listed.value : []
    expect(backup).toMatchObject({ key: BOOK, name: "サンプル帳簿_backup.zip" })
    const bytes = await store.fetch(backup?.id ?? "")
    const unpacked = bytes.ok ? here.ports.archiver.unpack(bytes.value) : bytes
    const { [MANIFEST_PATH]: manifest, ...files } = unpacked.ok ? unpacked.value : {}
    expect(files).toEqual(here.storage.peek(BOOK)?.files ?? {})
    expect(JSON.parse(manifest ?? "")).toEqual({ format: 1, bookId: BOOK, madeAt: "2026-10-07T03:00:00.000Z" })
  })

  test("is put back on a device that does not have it, as it was, with no history, and stands there as kept", async () => {
    const here = await withBook("here")
    await here.record("2026-10-08", 1000, "バックアップ前")
    const store = memoryBackupStore(here.ports.now)
    await backUpToStore(here.ports, store, BOOK)

    const there = await device("there")
    const listed = await storedBackups(there.ports, store)
    expect(listed.ok && listed.value.map((each) => each.here)).toEqual([false])
    const restored = await restoreFromStore(there.ports, store, listed.ok ? (listed.value[0]?.backup.id ?? "") : "")
    expect(restored).toEqual({ ok: true, value: BOOK })
    expect(there.storage.peek(BOOK)).toEqual({ book: { id: BOOK, members: [there.ports.me] }, files: here.storage.peek(BOOK)?.files ?? {} })
    expect(await there.history.log(BOOK)).toEqual({ ok: true, value: [] })
    expect(await there.standing()).toEqual(["kept"])
    expect((await there.record("2026-10-09", 500, "戻したあと")).ok).toBe(true)
    expect(await there.standing()).toEqual(["changed"])
  })

  test("is taken out of the store when asked, and the device no longer says the book is kept there", async () => {
    const store = memoryBackupStore(() => "2026-10-08T03:00:00.000Z")
    const here = await withBook("here")
    await backUpToStore(here.ports, store, BOOK)
    expect(await here.standing()).toEqual(["kept"])
    const listed = await storedBackups(here.ports, store)
    const backup = listed.ok ? listed.value[0]?.backup : undefined
    expect(backup === undefined ? undefined : await removeStoredBackup(here.ports, store, backup)).toEqual({ ok: true, value: undefined })
    expect(await storedBackups(here.ports, store)).toEqual({ ok: true, value: [] })
    expect(await here.standing()).toEqual(["never"])
    expect(here.storage.peek(BOOK)).toBeDefined()
  })

  test("is put back with the others chosen with it, one after another, and those not chosen are left where they are", async () => {
    const here = await withBook("here")
    const store = memoryBackupStore(here.ports.now)
    const OTHER = "second" as BookId
    const THIRD = "third" as BookId
    await here.session.createBook(await fixtureBook("basic-play", { id: OTHER, members: [here.ports.me] }))
    await here.session.createBook(await fixtureBook("basic-play", { id: THIRD, members: [here.ports.me] }))
    for (const id of [BOOK, OTHER, THIRD]) await backUpToStore(here.ports, store, id)

    const there = await device("there")
    const listed = await storedBackups(there.ports, store)
    const idOf = (key: BookId): string => (listed.ok ? (listed.value.find((each) => each.backup.key === key)?.backup.id ?? "") : "")
    expect(await restoreChosenFromStore(there.ports, store, [idOf(BOOK), idOf(THIRD)])).toEqual({ ok: true, value: 2 })
    expect([BOOK, OTHER, THIRD].map((id) => there.storage.peek(id) !== undefined)).toEqual([true, false, true])
    expect(await restoreChosenFromStore(there.ports, store, [])).toEqual({ ok: true, value: 0 })
  })

  test("stops at the first chosen that cannot be put back, and keeps those before it", async () => {
    const here = await withBook("here")
    const store = memoryBackupStore(here.ports.now)
    await backUpToStore(here.ports, store, BOOK)
    const there = await device("there")
    const listed = await storedBackups(there.ports, store)
    const id = listed.ok ? (listed.value[0]?.backup.id ?? "") : ""
    const restored = await restoreChosenFromStore(there.ports, store, [id, "no-such-backup"])
    expect(restored.ok).toBe(false)
    expect(there.storage.peek(BOOK)).toBeDefined()
  })

  test("is never put back over the book on the device", async () => {
    const here = await withBook("here")
    const store = memoryBackupStore(here.ports.now)
    await backUpToStore(here.ports, store, BOOK)
    await here.record("2026-10-08", 1000, "バックアップのあと")
    const kept = here.storage.peek(BOOK)

    const listed = await storedBackups(here.ports, store)
    expect(listed.ok && listed.value.map((each) => each.here)).toEqual([true])
    expect(await restoreFromStore(here.ports, store, listed.ok ? (listed.value[0]?.backup.id ?? "") : "")).toEqual({ ok: false, error: { type: "backup", problem: { type: "book-here", bookId: BOOK } } })
    expect(here.storage.peek(BOOK)).toEqual(kept)
    expect(await here.standing()).toEqual(["changed"])
  })

  test("lists the newest backup first", async () => {
    const here = await withBook("here")
    const other = "other" as BookId
    await here.session.createBook(await fixtureBook("basic-play", { id: other, members: [here.ports.me] }))
    const store = memoryBackupStore(here.ports.now)
    await backUpToStore(here.ports, store, BOOK)
    here.clock.now = "2026-10-08T03:00:00.000Z"
    await backUpToStore(here.ports, store, other)
    const listed = await storedBackups(here.ports, store)
    expect(listed.ok && listed.value.map((each) => each.backup.key)).toEqual([other, BOOK])
  })
})

describe("a book backed up to a file", () => {
  test("is handed over under its title and the day, and stands as kept", async () => {
    const here = await withBook("here")
    const receipt = await backUpToFile(here.ports, BOOK)
    expect(receipt.ok && receipt.value.destination).toBe("file")
    expect(here.handover.given().map((file) => file.name)).toEqual(["サンプル帳簿_2026-10-07_backup.zip"])
    expect(await here.standing()).toEqual(["kept"])
  })

  test("is not counted as backed up when the person closes the question", async () => {
    const here = await withBook("here", { type: "handover-cancelled" })
    expect(await backUpToFile(here.ports, BOOK)).toEqual({ ok: false, error: { type: "backup", problem: { type: "handover-cancelled" } } })
    expect(await here.standing()).toEqual(["never"])
  })

  test("is put back from the file on a device that does not have it", async () => {
    const here = await withBook("here")
    await backUpToFile(here.ports, BOOK)
    const there = await device("there")
    expect(await restoreFromFile(there.ports, here.handover.given()[0]?.bytes ?? new Uint8Array())).toEqual({ ok: true, value: BOOK })
    expect(there.storage.peek(BOOK)?.files).toEqual(here.storage.peek(BOOK)?.files ?? {})
    const books = await there.session.books()
    expect(books.ok && books.value.map((book) => book.title)).toEqual(["サンプル帳簿"])
  })
})

describe("a file that is not a backup to put back", () => {
  const packing = createZipArchiver()
  const packed = (files: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> => ((made) => (made.ok ? made.value : new Uint8Array()))(packing.pack(files))

  test("is refused when it is no zip", async () => {
    const there = await device("there")
    const restored = await restoreFromFile(there.ports, new TextEncoder().encode("not a zip"))
    expect(!restored.ok && restored.error.type === "backup" && restored.error.problem.type).toBe("archive-unreadable")
  })

  test("is refused when it does not say whose book it holds", async () => {
    const there = await device("there")
    expect(await restoreFromFile(there.ports, packed({ "main.journal": "" }))).toEqual({ ok: false, error: { type: "backup", problem: { type: "no-manifest" } } })
  })

  test("is refused, and nothing kept, when hledger does not read the book it holds", async () => {
    const there = await device("there")
    const broken = packed({ [MANIFEST_PATH]: JSON.stringify({ format: 1, bookId: BOOK, madeAt: "2026-10-07T03:00:00.000Z" }), "main.journal": "2026-10-07 片側だけ\n    資産:現金    100 JPY\n" })
    const restored = await restoreFromFile(there.ports, broken)
    expect(!restored.ok && restored.error.type).toBe("journal-rejected")
    expect(there.storage.peek(BOOK)).toBeUndefined()
    expect(await there.standing()).toEqual([])
  })
})
