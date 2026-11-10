import { describe, expect, test } from "bun:test"

import { renderEntry } from "../../../src/core/journal/entry"
import { importedIdsOf, importedTallyEntry } from "../../../src/other-apps/core/source-tally"
import { readManekuru } from "../../../src/other-apps/manekuru/csv-import"
import { dec } from "../../support/values"

/** The form of マネクルSP's sample file: a start as one cell, and no finish. */
const SAMPLE = "日付,開始時間,稼働時間（分）,投資金額,回収金額,期待値,投資種類,店舗,機種,タグ,メモ\n2022/5/20,18,90,8000,13800,5000,スロット,マレハン東京皇国第8支店,星の舞踏,天井狙い,\n2022/5/21,,,2000,5000,,,,流星の剣,タグ1/タグ2/タグ3,用事があったので途中で切り上げ\n"

/** The form its import guide asks for: a start and a finish as an hour and a minute each. */
const GUIDE = "日付,開始（時）,開始（分）,終了（時）,終了（分）,稼働時間(分間),投資金額,回収金額,期待値,投資種類,店舗,機種,タグ,メモ\n2026/11/08,22,30,1,15,,,3000,3000,4パチ,名もなき店,流星の剣,,朝一<br/>据え置き\n2026/11/09,,,,,,1000,,,,,,,\n"

describe("a マネクルSP CSV", () => {
  test("is read in its sample file's form: the start an hour alone, the minutes as hours, a 期待値 apart from the result kept, the 投資種類 saying the game and kept before the タグ", () => {
    const read = readManekuru(SAMPLE)
    expect(read.ok && read.value).toEqual([
      { date: "2022-05-20", parlor: { name: "マレハン東京皇国第8支店", code: "" }, machine: { name: "星の舞踏", code: "", maker: "" }, cabinetNumber: "", outlay: dec("8000"), takings: dec("13800"), memo: "", hours: dec("1.50"), clock: { started: { hour: 18, minute: 0 }, finished: undefined }, theoreticalValue: dec("5000"), gameKind: "pachislot", countedSpins: undefined, countedJackpots: undefined, sourceLabels: ["スロット", "天井狙い"] },
      { date: "2022-05-21", parlor: { name: "", code: "" }, machine: { name: "流星の剣", code: "", maker: "" }, cabinetNumber: "", outlay: dec("2000"), takings: dec("5000"), memo: "用事があったので途中で切り上げ", hours: undefined, clock: undefined, theoreticalValue: undefined, gameKind: undefined, countedSpins: undefined, countedJackpots: undefined, sourceLabels: ["タグ1", "タグ2", "タグ3"] },
    ] as never)
  })

  test("is read in its guide's form: hours from a start and a finish past midnight, an empty sum as none, the みなし期待値 left out, and <br/> as a line break", () => {
    const read = readManekuru(GUIDE)
    expect(read.ok && read.value.map((tally) => [tally.clock, tally.hours, tally.outlay, tally.takings, tally.theoreticalValue, tally.gameKind, tally.sourceLabels, tally.memo])).toEqual([
      [{ started: { hour: 22, minute: 30 }, finished: { hour: 1, minute: 15 } }, dec("2.75"), dec("0"), dec("3000"), undefined, "pachinko", ["4パチ"], "朝一\n据え置き"],
      [undefined, undefined, dec("1000"), dec("0"), undefined, undefined, [], ""],
    ] as never)
  })

  test("is not taken in where its first row lacks a column a file is known by", () => {
    expect(readManekuru("日付,店舗\n2026/11/08,店\n")).toEqual({ ok: false, error: { type: "not-manekuru", missing: ["投資金額", "回収金額"] } })
  })

  test("names each row that does not read, and what of it", () => {
    const read = readManekuru("日付,開始時間,稼働時間(分),投資金額,回収金額,期待値\n2026/11/08,25,90,1000,0,\n2026/11/09,,1時間,1000,0,たくさん\n")
    expect(read).toEqual({ ok: false, error: { type: "rows-unreadable", rows: [{ line: 2, fields: ["clock"] }, { line: 3, fields: ["hours", "theoreticalValue"] }] } })
  })
})

describe("a tally taken in from マネクルSP", () => {
  const [first] = ((read) => (read.ok ? read.value : []))(readManekuru(SAMPLE))

  test("writes the theoretical value it gave, and its start, where it said them, and is not given an inferred one beside it", () => {
    const entry = renderEntry(importedTallyEntry({ id: "x" as never, from: "manekuru", source: first as never, machine: undefined, inferred: { value: dec("100"), formulaId: "f", tokenRental: dec("4"), tokenExchange: dec("28"), spinPerformance: undefined } }))
    expect(entry).toContain("game-kind: pachislot, imported-from: manekuru, source-parlor: マレハン東京皇国第8支店, source-machine: 星の舞踏, source-label: スロット, source-label: 天井狙い, hours: 1.5, started: 18:00")
    expect(entry).toContain("(統計:期待値)")
    expect(entry).not.toContain("推定")
    expect(entry).not.toContain("inferred")
  })

  test("goes by an id that its start and its theoretical value tell apart", () => {
    const ids = importedIdsOf("manekuru", [first as never, { ...(first as never as object), theoreticalValue: dec("4000") } as never, { ...(first as never as object), clock: undefined } as never])
    expect(new Set(ids).size).toBe(3)
  })
})
