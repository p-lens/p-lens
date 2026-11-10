import { describe, expect, test } from "bun:test"

import { renderEntry } from "../../../src/core/journal/entry"
import { importedTallyEntry } from "../../../src/other-apps/core/source-tally"
import { shiftJisOf } from "../../../src/other-apps/core/shift-jis"
import { readMypachi } from "../../../src/other-apps/mypachi/csv-import"
import { dec } from "../../support/values"

/** A 件別収支表 as Myパチ収支表 writes it: its title, its column names, the tallies newest first, and the row saying when it was made. */
const TEXT = [
  "Myパチ収支表,件別収支表",
  "日,店,台,稼働,投資,回収,収支,時給,コメント,タグ,画像,期待値",
  "2026/11/09(月),マレハン東京皇国第8支店,スマスロ星の舞踏,1,\\50000,\\0,\\-50000,\\-50000,,,,",
  "2026/11/06(金),マレハン東京皇国第8支店,e流星の剣,0.8,\\8929,\\9821,\\+892,\\+1115,すぐやめ。,ハイエナ,,\\+1500",
  "2026/10/28(水),名もなき店,e流星の剣,1.5,\\0,\\5000,\\+5000,\\+3333,,日本語なら　そのままタグ化したい,,",
  ",,,,,,,,,,,作成日時 : 2026/11/10 22:10:18",
  "",
].join("\r\n")

describe("a Myパチ収支表 CSV", () => {
  test("is read from its Shift_JIS, a row a tally between its title and the row saying when it was made: its day without its weekday, its yen without their sign, its hours, its theoretical value, and its タグ broken at their spaces", () => {
    const read = readMypachi(shiftJisOf(TEXT))
    expect(read.ok && read.value).toEqual([
      { date: "2026-11-09", parlor: { name: "マレハン東京皇国第8支店", code: "" }, machine: { name: "スマスロ星の舞踏", code: "", maker: "" }, cabinetNumber: "", outlay: dec("50000"), takings: dec("0"), memo: "", hours: dec("1.00"), clock: undefined, theoreticalValue: undefined, gameKind: undefined, countedSpins: undefined, countedJackpots: undefined, sourceLabels: [] },
      { date: "2026-11-06", parlor: { name: "マレハン東京皇国第8支店", code: "" }, machine: { name: "e流星の剣", code: "", maker: "" }, cabinetNumber: "", outlay: dec("8929"), takings: dec("9821"), memo: "すぐやめ。", hours: dec("0.80"), clock: undefined, theoreticalValue: dec("1500"), gameKind: undefined, countedSpins: undefined, countedJackpots: undefined, sourceLabels: ["ハイエナ"] },
      { date: "2026-10-28", parlor: { name: "名もなき店", code: "" }, machine: { name: "e流星の剣", code: "", maker: "" }, cabinetNumber: "", outlay: dec("0"), takings: dec("5000"), memo: "", hours: dec("1.50"), clock: undefined, theoreticalValue: undefined, gameKind: undefined, countedSpins: undefined, countedJackpots: undefined, sourceLabels: ["日本語なら", "そのままタグ化したい"] },
    ] as never)
  })

  test("is read as UTF-8 too, as a person may have saved it again", () => {
    const read = readMypachi(new TextEncoder().encode(TEXT))
    expect(read.ok && read.value.length).toBe(3)
  })

  test("is not taken in where no row names the columns a tally needs", () => {
    expect(readMypachi(shiftJisOf("Myパチ収支表,件別収支表\r\n日,店\r\n2026/11/08,店\r\n"))).toEqual({ ok: false, error: { type: "not-mypachi", missing: ["投資", "回収"] } })
  })

  test("names each row that does not read by its line in the file, its title the first", () => {
    const read = readMypachi(shiftJisOf("Myパチ収支表,件別収支表\r\n日,稼働,投資,回収,期待値\r\n2026/11/08(土),1,\\1000,\\0,\r\n2026/11/09(日),ながい,\\1000,\\0,たくさん\r\n"))
    expect(read).toEqual({ ok: false, error: { type: "rows-unreadable", rows: [{ line: 4, fields: ["hours", "theoreticalValue"] }] } })
  })

  test("is no file's text where its bytes read as neither Shift_JIS nor UTF-8", () => {
    expect(readMypachi(new Uint8Array([0x82, 0xff, 0xff]))).toEqual({ ok: false, error: { type: "unreadable-text" } })
  })
})

describe("a tally taken in from Myパチ収支表", () => {
  test("writes the theoretical value it gave", () => {
    const read = readMypachi(shiftJisOf(TEXT))
    const second = read.ok ? read.value[1] : undefined
    expect(renderEntry(importedTallyEntry({ id: "x" as never, from: "mypachi", source: second as never, machine: undefined, inferred: undefined }))).toContain("(統計:期待値)                       1500 JPY")
  })
})
