import { describe, expect, test } from "bun:test"

import { readPachibo } from "../../../src/core/import/pachibo"
import { importedIdsOf, importedTallyEntry } from "../../../src/core/import/source-tally"
import { renderEntry } from "../../../src/core/journal/entry"
import { dec } from "../../support/values"

type Value = readonly [type: string, key: string, value: string]

/** Values as ぱち簿 writes them: `type,key,length,value,` one after another, each byte turned over. */
const pcbOf = (values: readonly Value[], measure: (value: string) => number = (value) => [...value].length): Uint8Array =>
  new TextEncoder().encode(values.map(([type, key, value]) => `${type},${key},${String(measure(value))},${value},`).join("")).map((byte) => 255 - byte)

const utf8 = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

const whole = (key: string, value: number): Value => ["Integer", key, String(value)]

const text = (key: string, value: string): Value => ["String", key, value]

const VALUES: readonly Value[] = [
  whole("item20261026_count", 1),
  whole("item20261026_0_hall_id", 270001),
  whole("item20261026_0_machine_id", 3001),
  whole("item20261026_0_invest", 25000),
  whole("item20261026_0_invest2", 12000),
  whole("item20261026_0_recovery", 140000),
  whole("item20261026_0_recovery2", 25000),
  ["Boolean", "item20261026_0_invest_store", "true"],
  whole("item20261026_0_start", 1000),
  whole("item20261026_0_end", 1940),
  whole("item20261026_0_time", 0),
  whole("item20261026_0_number", 1223),
  whole("item20261026_0_tag", 1152),
  text("item20261026_0_memo", "めもめま,\n\n"),
  whole("item20261109_count", 2),
  whole("item20261109_0_hall_id", 270002),
  whole("item20261109_0_machine_id", 11001),
  whole("item20261109_0_invest", 8000),
  whole("item20261109_0_invest2", 80000),
  whole("item20261109_0_recovery", 20000),
  whole("item20261109_0_recovery2", 0),
  whole("item20261109_0_start", -1),
  whole("item20261109_0_end", -1),
  whole("item20261109_0_time", 905),
  whole("item20261109_0_number", 0),
  whole("item20261109_0_tag", 8193),
  text("item20261109_0_memo", ""),
  whole("item20261109_1_machine_id", 11001),
  whole("item20261109_1_invest", 500),
  whole("item20261109_1_recovery", 0),
  ["Long", "first", "1793368639558"],
  text("hall270001_name", "マレハン東京皇国第8支店"),
  text("hall270001_address", "東京皇国 第8区"),
  whole("hall270001_savings_pachi", 140000),
  text("hall270002_name", "キコーネ浅草"),
  text("machine3001_name", "流星の剣"),
  text("machine3001_maker", "星工房"),
  text("machine11001_name", "スマスロ 星の舞踏"),
  text("machine11001_maker", "月工房"),
]

describe("a ぱち簿 file", () => {
  test("is read a tally an entry, its savings drawn and its cash summed on each side, as ぱち簿 sums a day's result", () => {
    const read = readPachibo(pcbOf(VALUES), utf8)
    expect(read.ok && read.value).toEqual([
      {
        date: "2026-10-26",
        parlor: { name: "マレハン東京皇国第8支店", code: "270001" },
        machine: { name: "流星の剣", code: "3001", maker: "星工房" },
        cabinetNumber: "1223",
        outlay: dec("37000"),
        takings: dec("165000"),
        memo: "めもめま,",
        hours: dec("9.67"),
        gameKind: "pachinko",
        countedSpins: undefined,
        countedJackpots: undefined,
        sourceLabels: ["新台", "イベント"],
      },
      {
        date: "2026-11-09",
        parlor: { name: "キコーネ浅草", code: "270002" },
        machine: { name: "スマスロ 星の舞踏", code: "11001", maker: "月工房" },
        cabinetNumber: "",
        outlay: dec("88000"),
        takings: dec("20000"),
        memo: "",
        hours: dec("9.08"),
        gameKind: "pachislot",
        countedSpins: undefined,
        countedJackpots: undefined,
        sourceLabels: ["20スロ", "ハイエナ"],
      },
      {
        date: "2026-11-09",
        parlor: { name: "", code: "" },
        machine: { name: "スマスロ 星の舞踏", code: "11001", maker: "月工房" },
        cabinetNumber: "",
        outlay: dec("500"),
        takings: dec("0"),
        memo: "",
        hours: undefined,
        gameKind: "pachislot",
        countedSpins: undefined,
        countedJackpots: undefined,
        sourceLabels: [],
      },
    ] as never)
  })

  test("reads every label by its bit, the two games' in one list", () => {
    const labels = Array.from({ length: 16 }, (_, bit) => ((read) => (read.ok ? read.value[0]?.sourceLabels : undefined))(readPachibo(pcbOf([whole("item20261106_count", 1), whole("item20261106_0_invest", 0), whole("item20261106_0_recovery", 0), whole("item20261106_0_tag", 2 ** bit)]), utf8)))
    expect(labels).toEqual([["20スロ"], ["10スロ"], ["5スロ"], ["4パチ"], ["2パチ"], ["1パチ"], ["角台"], ["新台"], ["初打ち"], ["バラエティ"], ["イベント"], ["雨"], ["朝一"], ["ハイエナ"], ["ノリ打ち"], ["甘デジ"]])
  })

  test("counts the hours of a play from a start to an end past midnight", () => {
    const read = readPachibo(pcbOf([whole("item20261106_count", 1), whole("item20261106_0_invest", 0), whole("item20261106_0_recovery", 0), whole("item20261106_0_start", 2230), whole("item20261106_0_end", 30)]), utf8)
    expect(read.ok && read.value[0]?.hours).toEqual(dec("2"))
  })

  test("reads a value whose length was counted in UTF-16 units, as one with a character beyond the basic plane may be", () => {
    const read = readPachibo(pcbOf([whole("item20261106_count", 1), whole("item20261106_0_invest", 0), whole("item20261106_0_recovery", 0), text("item20261106_0_memo", "勝ち😀,やった")], (value) => value.length), utf8)
    expect(read.ok && read.value[0]?.memo).toBe("勝ち😀,やった")
  })

  test("is refused where it is no file ぱち簿 wrote, holds no tally, or has a tally lacking what one needs", () => {
    expect(readPachibo(new TextEncoder().encode("日付,投資\n2026/11/08,100\n"), utf8)).toEqual({ ok: false, error: { type: "not-pachibo" } })
    expect(readPachibo(pcbOf([["Boolean", "graph", "true"]]), utf8)).toEqual({ ok: false, error: { type: "empty" } })
    expect(readPachibo(pcbOf([whole("item20261106_count", 2), whole("item20261106_0_invest", 0), whole("item20261106_0_recovery", 0), whole("item20261106_1_invest", -5)]), utf8)).toEqual({
      ok: false,
      error: { type: "entries-unreadable", entries: [{ date: "2026-11-06" as never, index: 1 }] },
    })
  })
})

describe("a tally taken in from ぱち簿", () => {
  const [first, second] = ((read) => (read.ok ? read.value : []))(readPachibo(pcbOf(VALUES), utf8))

  test("is written in yen, its parlor and machine with their codes, its labels each a tag of its own, and its memo on one line", () => {
    expect(renderEntry(importedTallyEntry({ id: "x" as never, from: "pachibo", source: first as never, machine: undefined, inferred: undefined }))).toBe(
      [
        "2026-10-26 マレハン東京皇国第8支店 | 流星の剣 1223番台  ; play-id: x, game-kind: pachinko, cabinet-number: 1223, imported-from: pachibo, source-parlor: マレハン東京皇国第8支店, source-parlor-code: 270001, source-machine: 流星の剣, source-machine-code: 3001, source-maker: 星工房, source-label: 新台, source-label: イベント, hours: 9.67",
        "    費用:遊技                           37000 JPY",
        "    収益:遊技                           -165000 JPY",
        "    純資産:特殊景品                     128000 JPY",
        "    純資産:換算調整勘定",
        "    ; めもめま，",
        "",
      ].join("\n"),
    )
  })

  test("goes by the same id taken in again", () => {
    expect(importedIdsOf("pachibo", [first as never, second as never])).toEqual(importedIdsOf("pachibo", [first as never, second as never]))
  })
})
