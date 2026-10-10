import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { editFile, type NamePorts } from "../../src/application/edit-file"
import { loadActivity } from "../../src/application/activity"
import type { Catalog } from "../../src/catalog/port/catalog"
import type { BookId } from "../../src/core/book/book"
import type { MachineSummary } from "../../src/core/catalog/catalog"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { saidIn } from "../support/values"

const BOOK = "edited" as BookId

const machine = (name: string, gameKind: "pachinko" | "pachislot"): MachineSummary => ({ id: name as never, gameKind, name, modelName: undefined, keywords: [], hitChance: undefined, releasedOn: "2025-01-01" as never, formulaCount: 1 })

/** The lists as a device has them: one parlor listed under its own name, one machine of each game catalogued. */
const PORTS: NamePorts = {
  parlors: { list: async () => Ok({ parlors: [{ id: "osm-9", name: "ホシゾラなんば新館", reading: "ほしぞらなんばしんかん", keywords: [], prefecture: "大阪府", address: "大阪市", location: undefined, submissions: [] } as never], rejections: [] }) },
  submissions: { list: async () => Ok([]), keep: async () => Ok(undefined) },
  catalog: { search: async (_query: string, gameKind: string) => Ok([machine("森物語", "pachinko"), machine("ハッピーピエロットEX", "pachislot")].filter((each) => each.gameKind === gameKind)) } as unknown as Catalog,
}

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  await storage.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-08T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  const text = (path: string): string => storage.peek(BOOK)?.files[path] ?? ""
  return { storage, history, session, text }
}

const TALLIED = (machineName: string, extra = ""): string => `\n2026-10-07 ${machineName}  ; play-id: by-hand, game-kind: pachinko, machine: ${machineName}${extra}\n    資産:現金                        3000 JPY\n    収益:遊技                        -3000 JPY\n`

describe("a book's file edited by hand", () => {
  test("is kept as one change where hledger reads it and it brings in no name the lists lack", async () => {
    const { session, history, text } = await setUp()
    const edited = `${text(BOOK_FILES.transactions)}${TALLIED("森物語")}`
    expect((await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, edited)).ok).toBe(true)
    expect(text(BOOK_FILES.transactions)).toBe(edited)
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && [activity.value.lines[0]?.did, saidIn(activity.value.lines[0]?.parts ?? {})]).toEqual(["file-edited", { file: { path: BOOK_FILES.transactions } }])
  })

  test("is not stopped by names the book already held", async () => {
    const { session, text } = await setUp()
    const edited = text(BOOK_FILES.transactions).replace("123番台", "124番台")
    expect((await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, edited)).ok).toBe(true)
  })

  test("is refused, and the book left as it was, where it brings in a machine the catalog has none of", async () => {
    const { session, text } = await setUp()
    const before = text(BOOK_FILES.transactions)
    expect(await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, `${before}${TALLIED("なんかの台")}`)).toEqual({
      ok: false,
      error: { type: "unknown-names", problems: [{ type: "machine-uncatalogued", name: "なんかの台", gameKind: "pachinko" }] },
    })
    expect(text(BOOK_FILES.transactions)).toBe(before)
    expect((await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, `${before}${TALLIED("ハッピーピエロットEX")}`)).ok).toBe(false)
  })

  test("is refused where it brings in a parlor the list lacks, or a listed one under another name", async () => {
    const { session, text } = await setUp()
    const accounts = text(BOOK_FILES.accounts)
    const declared = (name: string, id: string): string => `${accounts}\ncommodity 1. "玉(4円・${name})"\naccount 資産:貯玉:${name}:4円  ; parlor-id: ${id}\n`
    expect(await editFile(session, PORTS, BOOK, BOOK_FILES.accounts, declared("近所の店", "mine-1"))).toEqual({ ok: false, error: { type: "unknown-names", problems: [{ type: "parlor-unlisted", name: "近所の店" }] } })
    expect(await editFile(session, PORTS, BOOK, BOOK_FILES.accounts, declared("ホシゾラ難波", "osm-9"))).toEqual({
      ok: false,
      error: { type: "unknown-names", problems: [{ type: "parlor-misnamed", name: "ホシゾラ難波", listed: "ホシゾラなんば新館" }] },
    })
    expect((await editFile(session, PORTS, BOOK, BOOK_FILES.accounts, declared("ホシゾラなんば新館", "osm-9"))).ok).toBe(true)
  })

  test("is refused where hledger cannot read it, and the book still reads afterwards", async () => {
    const { session, text } = await setUp()
    const before = text(BOOK_FILES.transactions)
    const broken = await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, `${before}\n2026-10-07 壊れた\n    資産:現金    100 JPY\n`)
    expect(!broken.ok && broken.error.type).toBe("journal-rejected")
    expect(text(BOOK_FILES.transactions)).toBe(before)
    expect((await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, before.replace("123番台", "125番台"))).ok).toBe(true)
  })
})
