import { describe, expect, test } from "bun:test"

import { guessedMapping, missingOf, readGeneral, sheetOf, withColumn, type Mapping, type Sheet } from "../../../src/core/import/general"
import { signedYenOf } from "../../../src/core/import/cells"
import { dec } from "../../support/values"

const sheet = (text: string): Sheet => ((read) => (read.ok ? read.value : { header: [], rows: [], width: 0 }))(sheetOf(text))

const FILE = "日付,ホール,機種名,投資額,回収額,収支,種類,台番,稼働時間,総回転数,大当たり,備考,タグ,天気\n2026年11月8日,マレハン東京皇国第8支店,流星の剣,\"¥8,000\",7500円,-500,P,123,2:30,163,2,朝一,\"イベント,朝一\",晴れ\n2026/11/9,名もなき店,星の舞踏,0,0,+63000,スロ,,,,,,,\n"

describe("a person's own CSV", () => {
  test("is read as a sheet, its first row the columns' names, and is nothing to take in with no row under them", () => {
    const read = sheet(FILE)
    expect([read.header.length, read.rows.length, read.width]).toEqual([14, 2, 14])
    expect(sheetOf("日付,投資\n")).toEqual({ ok: false, error: { type: "empty" } })
  })

  test("is first offered its columns as the fields their names usually head, each field once, the rest left out", () => {
    expect(guessedMapping(sheet(FILE))).toEqual(["date", "parlor", "machine", "outlay", "takings", "result", "gameKind", "cabinetNumber", "hours", "spins", "jackpots", "memo", "labels", undefined])
    expect(guessedMapping(sheet("日付,日付,ＭＥＭＯ,\n1,2,3,4\n"))).toEqual(["date", undefined, undefined, undefined])
  })

  test("takes a field from any other column it was chosen for, and says what a tally still lacks", () => {
    const mapping: Mapping = ["date", "outlay", undefined]
    expect(withColumn(mapping, 2, "outlay")).toEqual(["date", undefined, "outlay"])
    expect(withColumn(mapping, 0, undefined)).toEqual([undefined, "outlay", undefined])
    expect(missingOf([undefined, "outlay"])).toEqual(["date", "sides"])
    expect(missingOf(["date", "outlay", "takings"])).toEqual([])
    expect(missingOf(["date", "result"])).toEqual([])
  })

  test("is read by its mapping: what went in and came back where both are chosen, and what it came to left aside", () => {
    const read = readGeneral(sheet(FILE), guessedMapping(sheet(FILE)))
    expect(read.ok && read.value[0]).toEqual({
      date: "2026-11-08",
      parlor: { name: "マレハン東京皇国第8支店", code: "" },
      machine: { name: "流星の剣", code: "", maker: "" },
      cabinetNumber: "123",
      outlay: dec("8000"),
      takings: dec("7500"),
      memo: "朝一",
      hours: dec("2.5"),
      gameKind: "pachinko",
      countedSpins: 163,
      countedJackpots: 2,
      sourceLabels: ["イベント", "朝一"],
    } as never)
  })

  test("takes a loss as what went in and a gain as what came back where only what it came to is chosen", () => {
    const read = readGeneral(sheet(FILE), ["date", undefined, undefined, undefined, undefined, "result"])
    expect(read.ok && read.value.map((tally) => [tally.date, tally.outlay, tally.takings, tally.parlor.name, tally.gameKind])).toEqual([
      ["2026-11-08", dec("500"), dec("0"), "", undefined],
      ["2026-11-09", dec("0"), dec("63000"), "", undefined],
    ] as never)
  })

  test("is refused whole where its mapping lacks what a tally needs or a row does not read", () => {
    expect(readGeneral(sheet(FILE), ["date", undefined, undefined, "outlay"])).toEqual({ ok: false, error: { type: "unmapped", missing: ["sides"] } })
    expect(readGeneral(sheet("日,収支,種別,時間\n2026/13/1,勝ち,麻雀,長い\n"), ["date", "result", "gameKind", "hours"])).toEqual({
      ok: false,
      error: { type: "rows-unreadable", rows: [{ line: 2, fields: ["date", "result", "gameKind", "hours"] }] },
    })
  })
})

describe("a result in yen as typed into a cell", () => {
  test("is signed, with its commas, its yen sign or 円 and a typeset minus allowed", () => {
    expect([signedYenOf("-500"), signedYenOf("+63,000"), signedYenOf("−1200"), signedYenOf("-¥1,000"), signedYenOf("¥-1,000"), signedYenOf("300円"), signedYenOf("0")]).toEqual([dec("-500"), dec("63000"), dec("-1200"), dec("-1000"), dec("-1000"), dec("300"), dec("0")])
    expect([signedYenOf(""), signedYenOf("勝ち"), signedYenOf("1.5")]).toEqual([undefined, undefined, undefined])
  })
})
