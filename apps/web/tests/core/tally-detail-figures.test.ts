import { describe, expect, test } from "bun:test"

import { decimal } from "../../src/core/decimal/decimal"
import { yenAnHourOf } from "../../src/core/report/figures"
import { wonInOf } from "../../src/core/report/tallies"
import type { Posting, Transaction } from "../../src/hledger/protocol/wire"

const posting = (account: string, commodity: string, mantissa: number): Posting => ({
  paccount: account,
  pamount: [{ acommodity: commodity, aquantity: { decimalMantissa: mantissa, decimalPlaces: 0 } }],
  preal: "RealPosting",
  ptags: [],
})

const entry = (postings: readonly Posting[]): Transaction => ({ tdate: "2026-11-07", tdescription: "", ttags: [], tpostings: postings })

describe("yen an hour", () => {
  test("is the yen over the hours played, to the whole yen", () => {
    expect(yenAnHourOf(decimal(5000n, 0), decimal(7200n, 0))).toEqual(decimal(2500n, 0))
    expect(yenAnHourOf(decimal(1000n, 0), decimal(5400n, 0))).toEqual(decimal(667n, 0))
    expect(yenAnHourOf(decimal(-3000n, 0), decimal(3600n, 0))).toEqual(decimal(-3000n, 0))
  })

  test("is none where no time was played", () => {
    expect(yenAnHourOf(decimal(5000n, 0), decimal(0n, 0))).toBeUndefined()
  })
})

describe("what a tally gave back was written in", () => {
  test("is tokens where its revenue is in tokens", () => {
    expect(wonInOf(entry([posting("収益:遊技", "玉(4円・ハナヤマ)", -4800), posting("資産:貯玉:ハナヤマ", "玉(4円・ハナヤマ)", 4800)]))).toBe("tokens")
  })

  test("is tokens where it gave nothing back but played tokens", () => {
    expect(wonInOf(entry([posting("費用:遊技", "玉(4円・ハナヤマ)", 2500), posting("資産:現金", "JPY", -10000)]))).toBe("tokens")
  })

  test("is yen where its revenue is in yen, or where it has none and played in yen", () => {
    expect(wonInOf(entry([posting("収益:遊技", "JPY", -20000), posting("純資産:特殊景品", "JPY", 20000)]))).toBe("yen")
    expect(wonInOf(entry([posting("費用:遊技", "JPY", 10000), posting("資産:現金", "JPY", -10000)]))).toBe("yen")
  })
})
