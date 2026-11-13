import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { machineNamesOf } from "../../src/core/catalog/catalog"
import type { PlayId } from "../../src/core/play/play"
import type { TallySummary } from "../../src/core/report/tallies"
import { groupName, playTimeText } from "../../src/ui/wording/breakdown"
import { decimal } from "../../src/core/decimal/decimal"
import { actualCaptions, shownDescription, spentCaptions, tallyTitle, wonCaptions } from "../../src/ui/wording/tallies"
import type { PlayTerms } from "../../src/core/parlor/terms"

const PLAY: TallySummary = { id: "one" as PlayId, date: "2026-10-21" as IsoDate, description: "マレハン東京皇国第8支店", parlorId: undefined, gameKind: "pachinko", machine: undefined, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: undefined , inferredValue: undefined}

const NAMES = machineNamesOf([
  { name: "e風の剣豪", modelName: "e風の剣豪KZ" },
  { name: "P流星群", modelName: undefined },
])

describe("what a tally is called in a list", () => {
  test("is its machine as the halls call it, though the book keeps the model name", () => {
    expect(tallyTitle({ ...PLAY, machine: "e風の剣豪KZ" }, NAMES)).toBe("e風の剣豪")
    expect(tallyTitle({ ...PLAY, machine: "P流星群" }, NAMES)).toBe("P流星群")
  })

  test("is its machine as the book says it where the catalog knows none under that name", () => {
    expect(tallyTitle({ ...PLAY, machine: "手で打った機種名" }, NAMES)).toBe("手で打った機種名")
    expect(tallyTitle({ ...PLAY, machine: "e風の剣豪KZ" }, machineNamesOf([]))).toBe("e風の剣豪KZ")
  })

  test("is a tally typed in by hand where it names none, a parlor named or not", () => {
    expect(tallyTitle(PLAY, NAMES)).toBe("手入力した収支")
    expect(tallyTitle({ ...PLAY, description: "" }, NAMES)).toBe("手入力した収支")
  })

  test("is what another app called it where it was taken in from one", () => {
    expect(tallyTitle({ ...PLAY, description: "東京皇国第8支店 流星 12番台", importedFrom: "precord" }, NAMES)).toBe("東京皇国第8支店 流星 12番台")
    expect(tallyTitle({ ...PLAY, description: " ", importedFrom: "precord" }, NAMES)).toBe("手入力した収支")
  })
})

describe("what a group of tallies is called", () => {
  test("is its machine as the halls call it when tallies are grouped by machine, and its key otherwise", () => {
    expect(groupName("machine", "e風の剣豪KZ", NAMES)).toBe("e風の剣豪")
    expect(groupName("machine", "手で打った機種名", NAMES)).toBe("手で打った機種名")
    expect(groupName("parlor", "e風の剣豪KZ", NAMES)).toBe("e風の剣豪KZ")
  })
})

describe("an entry's description on screen", () => {
  test("shows each side there is, with the bar between them only where both are", () => {
    expect(shownDescription("マレハン東京皇国第8支店 | e風の剣豪 12番台")).toBe("マレハン東京皇国第8支店 | e風の剣豪 12番台")
    expect(shownDescription("| e風の剣豪")).toBe("e風の剣豪")
    expect(shownDescription("名もなき店 |")).toBe("名もなき店")
    expect(shownDescription("|")).toBe("")
  })

  test("shows one written with no bar whole", () => {
    expect(shownDescription("e風の剣豪")).toBe("e風の剣豪")
  })

  test("names a tally taken in from another app by the sides it has", () => {
    expect(tallyTitle({ ...PLAY, importedFrom: "precord", description: "名もなき店 |" }, NAMES)).toBe("名もなき店")
    expect(tallyTitle({ ...PLAY, importedFrom: "precord", description: "|" }, NAMES)).toBe("手入力した収支")
  })
})

describe("a play time on screen", () => {
  test("is whole hours and minutes, the seconds dropped, and minutes alone under an hour", () => {
    expect(playTimeText(decimal(19_800n, 0))).toBe("5時間30分")
    expect(playTimeText(decimal(2_759n, 0))).toBe("45分")
    expect(playTimeText(decimal(36_000_000n, 0))).toBe("10,000時間0分")
    expect(playTimeText(decimal(18_180n, 0))).toBe("5時間3分")
    expect(playTimeText(decimal(3_600n, 0))).toBe("1時間0分")
    expect(playTimeText(decimal(180n, 0))).toBe("3分")
  })
})

const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { tokens: 28, yen: 100 }, replay: { paidOut: 125, deducted: 125 } }
const NONE = { rentalSpread: decimal(0n, 0), replayFee: decimal(0n, 0) }

describe("what is said under a tally's figures", () => {
  test("names the exchange rate its play was valued at, as the book keeps it, or its day's where its terms are unknown", () => {
    expect(actualCaptions(TERMS)).toEqual(["交換率3.571429で評価"])
    expect(actualCaptions(undefined)).toEqual(["稼働日の交換率で評価"])
    expect(wonCaptions("pachinko", "tokens", TERMS)).toEqual(["玉数×交換率3.571429で計算"])
    expect(wonCaptions("pachislot", "tokens", undefined)).toEqual(["メダル数×稼働日の交換率で計算"])
    expect(wonCaptions("pachinko", "yen", TERMS)).toEqual([])
  })

  test("says the rental spread and the replay fee 投資 holds, each where it is any", () => {
    expect(spentCaptions("pachinko", { ...NONE, rentalSpread: decimal(1290n, 0) }, true)).toEqual(["貸玉差額¥1,290を含む"])
    expect(spentCaptions("pachinko", { rentalSpread: decimal(1290n, 0), replayFee: decimal(3570n, 2) }, true)).toEqual(["貸玉差額¥1,290と再プレイ手数料¥36を含む"])
    expect(spentCaptions("pachislot", NONE, true)).toEqual(["貸メダル差額なし"])
  })

  test("says a play paid for out of savings alone was so, with the replay fee it cost where any", () => {
    expect(spentCaptions("pachinko", NONE, false)).toEqual(["貯玉投資のみ"])
    expect(spentCaptions("pachislot", { ...NONE, replayFee: decimal(200n, 0) }, false)).toEqual(["貯メダル投資のみ", "再プレイ手数料¥200を含む"])
  })
})
