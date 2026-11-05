import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"

import type { BookSession } from "../../src/application/book-session"
import type { BookId } from "../../src/core/book/book"
import { appendEntry, BOOK_FILES } from "../../src/core/journal/layout"
import { Ok } from "../../src/core/result/result"
import type { HledgerClient } from "../../src/hledger/client/client"
import { joinByCode } from "../../src/crossing/application/joining"
import { KIND } from "../../src/crossing/core/kinds"
import { stopSync } from "../../src/crossing/application/book-sync"
import { inProcessHledger } from "../support/in-process"
import { BOOK, closeLines, deviceOn, letEverythingGo, relayOf, twoDevices as twoOn, until } from "./support/devices"

const MARKER = "MARKER-ネルフ本部-0451"

const held = { hledgers: [] as HledgerClient[] }

beforeAll(async () => {
  held.hledgers = [await inProcessHledger(), await inProcessHledger(), await inProcessHledger()]
})

afterEach(letEverythingGo)

afterAll(() => {
  held.hledgers = []
})

const twoDevices = (seed?: Parameters<typeof twoOn>[1]) => twoOn(held.hledgers, seed)

const entryOf = (day: string, yen: number, note: string): string => `${day} ${note}\n    費用:遊技  ${yen} JPY\n    資産:現金`

describe("a book between the owner's devices", () => {
  test("a device joining by the code gets the book whole, under the same id", async () => {
    const { one, other } = await twoDevices()
    expect(joinedId(await other.session.books())).toEqual([BOOK])
    expect(await other.files()).toEqual(await one.files())
  })

  test("what one device writes reaches the other, and back", async () => {
    const { one, other, lineOne, lineOther } = await twoDevices()
    await one.write(entryOf("2026-11-01", 1000, "一台目"))
    lineOne.book.wrote()
    await until(async () => (await other.files())[BOOK_FILES.transactions]?.includes("一台目") === true)
    await other.write(entryOf("2026-11-02", 2000, "二台目"))
    lineOther.book.wrote()
    await until(async () => (await one.files())[BOOK_FILES.transactions]?.includes("二台目") === true)
    await until(async () => JSON.stringify(await one.files()) === JSON.stringify(await other.files()))
  }, 20_000)

  test("what the relay would not take for being sent too fast goes again a moment later, with nothing more written", async () => {
    const { one, other, lineOne } = await twoDevices()
    relayOf()?.refuseWith("rate-limited: slow down")
    await one.write(entryOf("2026-11-05", 500, "待たされた分"))
    lineOne.book.wrote()
    await until(() => one.last()?.type === "refused")
    relayOf()?.refuseWith(undefined)
    await until(async () => (await other.files())[BOOK_FILES.transactions]?.includes("待たされた分") === true, 25_000)
  }, 40_000)

  test("a relay that lost the line is given a base again by the owner's device as it catches up, and a device joins from it", async () => {
    const { one, code } = await twoDevices()
    await closeLines()
    relayOf()?.forgetEverything()
    await one.open()
    await until(() => relayOf()?.events().some((event) => event.kind === KIND.bookChange) === true)
    await until(() => relayOf()?.events().filter((event) => event.kind === KIND.tip).length === 2)
    const third = deviceOn(relayOf()?.url ?? "", held.hledgers[2] as HledgerClient)
    const joined = await joinByCode(third.ports, code)
    expect(joined).toEqual(Ok({ type: "book", bookId: BOOK }))
    expect((await third.files())[BOOK_FILES.transactions]).toEqual((await one.files())[BOOK_FILES.transactions])
  }, 30_000)

  test("what both wrote apart is merged, and both come to the same book", async () => {
    const { one, other } = await twoDevices()
    await closeLines()
    await one.write(entryOf("2026-11-03", 1000, "一台目だけ"))
    await other.write(entryOf("2026-11-04", 2000, "二台目だけ"))
    await one.open()
    await other.open()
    await until(async () => (await one.files())[BOOK_FILES.transactions]?.includes("二台目だけ") === true && (await other.files())[BOOK_FILES.transactions]?.includes("一台目だけ") === true, 15_000)
    await until(async () => JSON.stringify(await one.files()) === JSON.stringify(await other.files()), 15_000)
    expect([one.last()?.type, other.last()?.type]).toEqual(["synced", "synced"])
  }, 30_000)

  test("one line rewritten two ways waits on a person, and their choice reaches the other", async () => {
    const { one, other } = await twoDevices((files) => ({ ...files, [BOOK_FILES.transactions]: appendEntry(files[BOOK_FILES.transactions] ?? "", entryOf("2026-11-05", 500, "直す前")) }))
    await closeLines()
    await one.rewrite("直す前", "一台目で直した")
    await other.rewrite("直す前", "二台目で直した")
    const [again, otherAgain] = [await one.open(), await other.open()]
    await until(() => one.last()?.type === "conflict" && other.last()?.type === "conflict", 15_000)
    const standing = one.last()
    if (standing?.type !== "conflict") throw new Error("expected a conflict")
    const settled = await again.book.settle({ ...standing.conflict.merged, ...Object.fromEntries(Object.entries(standing.conflict.ours).filter(([path]) => standing.conflict.merged[path] === undefined)) })
    expect(settled.ok).toBe(true)
    await until(async () => (await other.files())[BOOK_FILES.transactions]?.includes("一台目で直した") === true, 15_000)
    await until(() => other.last()?.type === "synced" && one.last()?.type === "synced", 15_000)
    expect((await other.files())[BOOK_FILES.transactions]).not.toContain("二台目で直した")
    expect(otherAgain).toBeDefined()
  }, 30_000)

  test("a book too large for one seal goes in parts", async () => {
    const noise = Array.from({ length: 4000 }, (_, index) => `; ${index} ${crypto.randomUUID()} ${crypto.randomUUID()}`).join("\n")
    const { one, other } = await twoDevices((files) => ({ ...files, [BOOK_FILES.accounts]: `${files[BOOK_FILES.accounts] ?? ""}\n${noise}\n` }))
    expect(await other.files()).toEqual(await one.files())
    expect(relayOf()?.events().filter((event) => event.kind === 4738).length).toBeGreaterThan(4)
  }, 30_000)

  test("the relay holds nothing of the book that can be read", async () => {
    const { one, lineOne } = await twoDevices((files) => ({ ...files, [BOOK_FILES.main]: `${files[BOOK_FILES.main] ?? ""}\n; ${MARKER}\n` }))
    await one.write(entryOf("2026-11-06", 700, MARKER))
    lineOne.book.wrote()
    await until(() => (relayOf()?.events().length ?? 0) >= 4)
    const everything = JSON.stringify(relayOf()?.events())
    expect(everything).not.toContain(MARKER)
    expect(everything).not.toContain("ネルフ")
    expect(everything).not.toContain(BOOK)
    expect(relayOf()?.events().every((event) => event.tags.every((tag) => ["v", "d"].includes(tag[0] ?? "")))).toBe(true)
  }, 20_000)

  test("a code read twice, or a book already here, is refused, and a stopped device lets its line go", async () => {
    const { other, code } = await twoDevices()
    expect(await joinByCode(other.ports, code)).toEqual({ ok: false, error: { type: "book-here" } })
    expect(await joinByCode(other.ports, "p-lens-sync:1:x")).toEqual({ ok: false, error: { type: "not-a-code" } })
    expect((await stopSync(other.ports, BOOK)).ok).toBe(true)
    expect(await other.lines.links()).toEqual(Ok([]))
    expect(joinedId(await other.session.books())).toEqual([BOOK])
  }, 20_000)
})

const joinedId = (books: Awaited<ReturnType<BookSession["books"]>>): readonly BookId[] => (books.ok ? books.value.map((book) => book.id) : [])
