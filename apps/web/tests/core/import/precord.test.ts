import { describe, expect, test } from "bun:test"

import { rowsOfCsv } from "../../../src/core/import/csv-rows"
import { readPrecord } from "../../../src/core/import/precord"
import { importedIdsOf, importedTallyEntry } from "../../../src/core/import/source-tally"
import { renderEntry } from "../../../src/core/journal/entry"
import { dec } from "../../support/values"

const HEADER = "日付,店舗コード,店舗,メーカー,機種コード,機種,台番号,投資額,回収額,収支,メモ,稼働時間,時給,貯玉"

const FILE = `﻿${HEADER}\r\n2019/01/02,S123,マレハン東京皇国店,ミナト,M9,流星の剣,123,12000,20000,8000,"朝イチ, 設定6: たぶん",5,1600,0\r\n2019/1/5,,名もなき店,,,,,5000,0,-5000,,,,\r\n`

describe("a CSV text as rows", () => {
  test("keeps commas, quotes and line breaks inside a quoted cell, and passes over the mark at its head and empty rows", () => {
    expect(rowsOfCsv('﻿a,"b,c","say ""x""","two\nlines"\r\n\r\n1,2\n')).toEqual({ ok: true, value: [["a", "b,c", 'say "x"', "two\nlines"], ["1", "2"]] })
    expect(rowsOfCsv('a,""\n')).toEqual({ ok: true, value: [["a", ""]] })
  })

  test("does not read where a quote stands inside a cell not begun with one, after a quoted cell's end, or is never closed, saying on which line", () => {
    expect(rowsOfCsv('a,b\n1,14"台\n')).toEqual({ ok: false, error: { type: "stray-quote", line: 2 } })
    expect(rowsOfCsv('a,b\n1,"x"y\n')).toEqual({ ok: false, error: { type: "stray-quote", line: 2 } })
    expect(rowsOfCsv('a,b\n1,"当たり\n2,3\n')).toEqual({ ok: false, error: { type: "unclosed-quote", line: 4 } })
  })
})

describe("a pRecord CSV", () => {
  test("is read a row a tally, its day whichever way it is written, its unread columns passed over", () => {
    const read = readPrecord(FILE)
    expect(read.ok && read.value).toEqual([
      { date: "2019-01-02", parlor: { name: "マレハン東京皇国店", code: "S123" }, machine: { name: "流星の剣", code: "M9", maker: "ミナト" }, cabinetNumber: "123", outlay: dec("12000"), takings: dec("20000"), memo: "朝イチ, 設定6: たぶん", hours: dec("5") },
      { date: "2019-01-05", parlor: { name: "名もなき店", code: "" }, machine: { name: "", code: "", maker: "" }, cabinetNumber: "", outlay: dec("5000"), takings: dec("0"), memo: "", hours: undefined },
    ] as never)
  })

  test("reads how long a tally's play lasted as pRecord writes it, hours with their minutes as a fraction, to the hundredth — and none where it says none", () => {
    const hours = (cell: string) => ((read) => (read.ok ? read.value[0]?.hours : "unread"))(readPrecord(`日付,投資額,回収額,稼働時間\n2026/10/11,1000,0,${cell}\n`))
    expect([hours("2.4166667"), hours("1.75"), hours("0.083333336"), hours("2:25")]).toEqual([dec("2.42"), dec("1.75"), dec("0.08"), dec("2.42")])
    expect([hours(""), hours("0"), hours("0.001")]).toEqual([undefined, undefined, undefined])
    expect([hours("長い"), hours("2時間"), hours("-1")]).toEqual(["unread", "unread", "unread"])
  })

  test("finds its columns by name, wherever they stand", () => {
    const read = readPrecord("回収額,日付,投資額\n300,2020/02/03,100\n")
    expect(read.ok && read.value.map((tally) => [tally.date, tally.outlay, tally.takings, tally.parlor.name])).toEqual([["2020-02-03", dec("100"), dec("300"), ""]] as never)
  })

  test("is refused whole where it lacks a column a tally needs, holds nothing, or has a row that does not read", () => {
    expect(readPrecord("日付,店舗\n2019/01/02,店\n")).toEqual({ ok: false, error: { type: "not-precord", missing: ["投資額", "回収額"] } })
    expect(readPrecord(`${HEADER}\r\n`)).toEqual({ ok: false, error: { type: "empty" } })
    expect(readPrecord("")).toEqual({ ok: false, error: { type: "empty" } })
    expect(readPrecord("日付,投資額,回収額\n2019/01/02,100,200\n2019/13/40,x,-5\n01/02,1,1\n")).toEqual({
      ok: false,
      error: { type: "rows-unreadable", rows: [{ line: 3, fields: ["date", "outlay", "takings"] }, { line: 4, fields: ["date"] }] },
    })
  })
})

describe("an imported tally", () => {
  const [first, second] = ((read) => (read.ok ? read.value : []))(readPrecord(FILE))

  test("is one entry in yen with both its sides and its gain in the special prizes, never in cash, the source's names in tags of their own and its note under it", () => {
    const [id] = importedIdsOf("precord", [first as never])
    expect(renderEntry(importedTallyEntry({ id: id as never, from: "precord", source: first as never, machine: undefined, inferred: undefined }))).toBe(
      [
        `2019-01-02 マレハン東京皇国店 | 流星の剣 123番台  ; play-id: ${id}, cabinet-number: 123, imported-from: precord, source-parlor: マレハン東京皇国店, source-parlor-code: S123, source-machine: 流星の剣, source-machine-code: M9, source-maker: ミナト, hours: 5`,
        "    費用:遊技                           12000 JPY",
        "    収益:遊技                           -20000 JPY",
        "    純資産:特殊景品                     8000 JPY",
        "    ; 朝イチ， 設定6： たぶん",
        "",
      ].join("\n"),
    )
  })

  test("names the catalog's machine and its game only where it was matched, and writes no posting that moves nothing", () => {
    const text = renderEntry(importedTallyEntry({ id: "x" as never, from: "precord", source: second as never, machine: undefined, inferred: undefined }))
    expect(text).toBe("2019-01-05 名もなき店 |  ; play-id: x, imported-from: precord, source-parlor: 名もなき店\n    費用:遊技                           5000 JPY\n    資産:現金                           -5000 JPY\n")
    expect(renderEntry(importedTallyEntry({ id: "x" as never, from: "precord", source: first as never, machine: { name: "流星の剣", gameKind: "slot" }, inferred: undefined }))).toContain("play-id: x, game-kind: slot, machine: 流星の剣, cabinet-number: 123, imported-from")
  })

  test("goes by an id the same tally always gets, twins told apart by their order", () => {
    const ids = importedIdsOf("precord", [first, second, first] as never)
    expect(ids).toEqual(importedIdsOf("precord", [first, second, first] as never))
    expect(ids[0]).toMatch(/^precord-20190102-[0-9a-f]{8}$/)
    expect(ids[2]).toBe(`${ids[0]}-2` as never)
    expect(new Set(ids).size).toBe(3)
  })
})
