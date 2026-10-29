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

const machine = (name: string, gameKind: "pachinko" | "pachislot"): MachineSummary => ({ id: name as never, gameKind, name, modelName: undefined, keywords: [], hitChance: undefined, formulaHitChances: [], releasedOn: "2025-01-01" as never, formulaCount: 1 })

/** The lists as a device has them: one parlor listed under its own name, one machine of each game catalogued. */
const PORTS: NamePorts = {
  parlors: { list: async () => Ok({ parlors: [{ id: "osm-9", name: "ダイナモなんかつ新館", reading: "だいなもなんかつしんかん", keywords: [], prefecture: "大阪府", address: "大阪市", location: undefined, submissions: [] } as never], rejections: [] }), readAt: async () => undefined },
  submissions: { list: async () => Ok([]), keep: async () => Ok(undefined) },
  catalog: { search: async (_query: string, gameKind: string) => Ok([machine("森物語", "pachinko"), machine("ハッピーピエロットEX", "pachislot")].filter((each) => each.gameKind === gameKind)) } as unknown as Catalog,
}

/** A gain put to cash, as a play typed in by hand was written before cash was held never to rise. */
const CASH_RAISED = (day: string, yen: number): string => `\n${day} 森物語  ; play-id: raised-${day}, game-kind: pachinko, machine: 森物語\n    資産:現金                        ${yen} JPY\n    収益:遊技                        -${yen} JPY\n`

const setUp = async (held = "") => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const fixture = await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] })
  await storage.createBook({ ...fixture, files: { ...fixture.files, [BOOK_FILES.transactions]: `${fixture.files[BOOK_FILES.transactions] ?? ""}${held}` } })
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-08T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  const text = (path: string): string => storage.peek(BOOK)?.files[path] ?? ""
  return { storage, history, session, text }
}

const TALLIED = (machineName: string, extra = ""): string => `\n2026-10-07 ${machineName}  ; play-id: by-hand, game-kind: pachinko, machine: ${machineName}${extra}\n    費用:遊技                        3000 JPY\n    資産:現金                        -3000 JPY\n`

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
    expect(await editFile(session, PORTS, BOOK, BOOK_FILES.accounts, declared("ダイナモ南葛", "osm-9"))).toEqual({
      ok: false,
      error: { type: "unknown-names", problems: [{ type: "parlor-misnamed", name: "ダイナモ南葛", listed: "ダイナモなんかつ新館" }] },
    })
    expect((await editFile(session, PORTS, BOOK, BOOK_FILES.accounts, declared("ダイナモなんかつ新館", "osm-9"))).ok).toBe(true)
  })

  test("is refused, and the book left as it was, where it raises cash: a gain is prizes taken home, never cash", async () => {
    const { session, text } = await setUp()
    const before = text(BOOK_FILES.transactions)
    const refused = await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, `${before}${CASH_RAISED("2026-10-07", 3000)}`)
    expect(!refused.ok && refused.error.type === "cash-raised" && refused.error.raised.map((each) => [each.date, each.description, each.amount.mantissa])).toEqual([["2026-10-07", "森物語", 3000n]])
    expect(text(BOOK_FILES.transactions)).toBe(before)
  })

  test("is not stopped by cash a book already held raised, and is refused one more of it", async () => {
    const { session, text } = await setUp(CASH_RAISED("2026-10-06", 5000))
    const before = text(BOOK_FILES.transactions)
    expect((await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, before.replace("123番台", "126番台"))).ok).toBe(true)
    const held = text(BOOK_FILES.transactions)
    const again = await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, `${held}${CASH_RAISED("2026-10-06", 5000).replace("raised-2026-10-06", "raised-again")}`)
    expect(!again.ok && again.error.type === "cash-raised" && again.error.raised.length).toBe(1)
    expect(text(BOOK_FILES.transactions)).toBe(held)
  })

  test("is refused where hledger cannot read it, and the book still reads afterwards", async () => {
    const { session, text } = await setUp()
    const before = text(BOOK_FILES.transactions)
    const broken = await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, `${before}\n2026-10-07 壊れた\n    資産:現金    100 JPY\n`)
    expect(!broken.ok && broken.error.type).toBe("journal-rejected")
    expect(text(BOOK_FILES.transactions)).toBe(before)
    expect((await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, before.replace("123番台", "125番台"))).ok).toBe(true)
  })
  test("is refused, and the book left as it was, where it leaves a tally's entry in a shape the app would read past", async () => {
    const { session, text } = await setUp()
    const before = text(BOOK_FILES.transactions)
    const refusedWith = async (edited: string): Promise<unknown> => ((found) => (!found.ok && found.error.type === "tally-problems" ? found.error.problems : found))(await editFile(session, PORTS, BOOK, BOOK_FILES.transactions, edited))
    expect(await refusedWith(`${before}${TALLIED("森物語", ", finished: 25:00")}`)).toEqual([{ type: "tag-unreadable", playId: "by-hand", tag: "finished" }])
    expect(await refusedWith(`${before}${TALLIED("森物語")}${TALLIED("森物語")}`)).toEqual([{ type: "play-id-twice", playId: "by-hand" }])
    expect(await refusedWith(`${before}${TALLIED("森物語", ", parlor-id: osm-404")}`)).toEqual([{ type: "parlor-unknown", playId: "by-hand" }])
    expect(text(BOOK_FILES.transactions)).toBe(before)
  })

  test("is refused, and the file left as it was, where it leaves a file beside the journal that read in a shape it does not", async () => {
    const { session, text } = await setUp()
    const refused = await editFile(session, PORTS, BOOK, "settings.json", "{{")
    expect(!refused.ok && refused.error).toEqual({ type: "file-unreadable", file: { path: "settings.json", lines: undefined } })
    expect(text("settings.json")).not.toBe("{{")
  })
})
