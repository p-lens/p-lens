import { afterEach, describe, expect, test } from "bun:test"

import { readTokenCommodity, tokenCommodity } from "../../src/core/commodity/commodity"
import { seal, turnMumming } from "../../src/mummer"
import { accountText } from "../../src/ui/wording/accounts"
import { cabinetFieldMasked, cabinetText } from "../../src/ui/wording/cabinet"
import { commodityText } from "../../src/ui/wording/commodities"
import { parlorChoiceText, parlorNameText, parlorNote } from "../../src/ui/wording/parlor"
import { memberNameText, titleFieldMasked, titleText } from "../../src/ui/wording/book"
import { groupName } from "../../src/ui/wording/breakdown"
import { shownDescription } from "../../src/ui/wording/tallies"

afterEach(() => turnMumming(false))

describe("where a person plays, outside mumming", () => {
  test("is shown as it is written", () => {
    expect(parlorNameText(seal.parlor("マレハン東京皇国店"))).toBe("マレハン東京皇国店")
    expect(cabinetText(seal.cabinet("123"))).toBe("123番台")
    expect(cabinetText(undefined)).toBe("----番台")
    expect(accountText("資産:貯玉:マレハン東京皇国店:4円")).toBe("資産:貯玉:マレハン東京皇国店:4円")
    expect(shownDescription("マレハン東京皇国店 | e風の剣豪 12番台")).toBe("マレハン東京皇国店 | e風の剣豪 12番台")
    expect(cabinetFieldMasked(seal.cabinet("123"))).toBe(false)
  })
})

describe("where a person plays, while mumming", () => {
  test("is veiled in one shape, whatever the name or number", () => {
    turnMumming(true)
    expect([parlorNameText(seal.parlor("マレハン東京皇国店")), parlorNameText(seal.parlor("A"))]).toEqual(["••••店", "••••店"])
    expect(cabinetText(seal.cabinet("1234"))).toBe("•••番台")
    expect(cabinetFieldMasked(seal.cabinet("123"))).toBe(true)
  })

  test("keeps a name's length in a list to choose from, and veils where the parlor is", () => {
    turnMumming(true)
    expect(parlorChoiceText(seal.parlor("マレハン東京皇国店"))).toBe("•••••••••")
    expect(parlorNote({ prefecture: "東京都", location: undefined }, undefined)).toBe("--")
  })

  test("is veiled inside an account and an entry's description, the rest left as it is", () => {
    turnMumming(true)
    expect(accountText("資産:貯玉:マレハン東京皇国店:4円")).toBe("資産:貯玉:••••店:4円")
    expect(accountText("費用:貸玉差額")).toBe("費用:貸玉差額")
    expect(shownDescription("マレハン東京皇国店 | e風の剣豪 12番台")).toBe("••••店 | e風の剣豪 •••番台")
    expect(shownDescription("| 景品交換")).toBe("景品交換")
    expect(shownDescription("手で書いた何か")).toBe("••••")
  })
})

describe("a parlor's tokens as a commodity", () => {
  test("are read back into what they were written from, and nothing else is", () => {
    expect(readTokenCommodity(tokenCommodity("medal", "マレハン・東京皇国店", "20円"))).toEqual({ kind: "medal", tier: "20円", parlorName: "マレハン・東京皇国店" })
    expect([readTokenCommodity("JPY"), readTokenCommodity("玉()"), readTokenCommodity("秒")]).toEqual([undefined, undefined, undefined])
  })

  test("show the parlor veiled while mumming", () => {
    expect(commodityText("玉(4円・マレハン東京皇国店)")).toBe("玉(4円・マレハン東京皇国店)")
    turnMumming(true)
    expect([commodityText("玉(4円・マレハン東京皇国店)"), commodityText("JPY")]).toEqual(["玉(4円・••••店)", "JPY"])
  })
})

describe("a breakdown's groups", () => {
  test("name a parlor veiled while mumming, and a machine as it is", () => {
    turnMumming(true)
    expect([groupName("parlor", "マレハン東京皇国店", new Map()), groupName("year", "2026", new Map())]).toEqual(["••••店", "2026年"])
  })
})

describe("a book's name", () => {
  test("keeps its first character while mumming, an emoji counted as one, and veils the rest in one shape", () => {
    expect(titleText("🌱マイ帳簿")).toBe("🌱マイ帳簿")
    turnMumming(true)
    expect([titleText("🌱マイ帳簿"), titleText("1️⃣番目の帳簿"), titleText("あ")]).toEqual(["🌱•••", "1️⃣•••", "あ•••"])
    expect(titleFieldMasked()).toBe(true)
  })
})

describe("a member's name", () => {
  test("keeps its first character while mumming, as a book's does", () => {
    expect(memberNameText("中森明菜")).toBe("中森明菜")
    turnMumming(true)
    expect(memberNameText("中森明菜")).toBe("中•••")
  })
})
