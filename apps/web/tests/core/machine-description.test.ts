import { describe, expect, test } from "bun:test"

import { bookNameOf } from "../../src/core/catalog/catalog"
import { machineMatches, readHitChance, readKeywords, readModelName } from "../../src/core/catalog/description"

const GENKI = { name: "e星都幻鬼", modelName: "e星都幻鬼W", keywords: ["ゲンキ", "TG"] }
const HIKARI = { name: "P魔法少女ひかり☆ルミエ3", modelName: undefined, keywords: ["ひかルミ"] }
const WELT = { name: "L機巧騎ヴェルトレイヴ", modelName: undefined, keywords: ["ヴヴヴ"] }
const BARON = { name: "Pバロンの城", modelName: undefined, keywords: [] }

describe("finding a machine", () => {
  test("by its name, its model name or a word it is searched by", () => {
    for (const typed of ["幻鬼", "星都", "幻鬼w", "ゲンキ", "tg"]) expect([typed, machineMatches(GENKI, typed)]).toEqual([typed, true])
    expect(machineMatches(GENKI, "ヴェルトレイヴ")).toBe(false)
  })

  test("katakana as hiragana, widths, case, spaces and stars aside", () => {
    for (const typed of ["げんき", "ｹﾞﾝｷ", "ＴＧ", "ｅ 星都 幻鬼"]) expect([typed, machineMatches(GENKI, typed)]).toEqual([typed, true])
    for (const typed of ["ひかりルミエ", "ひかり★ルミエ", "ひかるみ", "ヒカルミ"]) expect([typed, machineMatches(HIKARI, typed)]).toEqual([typed, true])
  })

  test("ヴ as the バ row, whichever of the two was registered and whichever is typed", () => {
    for (const typed of ["ヴェルトレイヴ", "ベルトレイブ", "べるとれいぶ", "ｳﾞｪﾙﾄﾚｲｳﾞ", "ヴヴヴ", "ブブブ", "ぶぶぶ"]) expect([typed, machineMatches(WELT, typed)]).toEqual([typed, true])
    for (const typed of ["バロン", "ヴァロン", "ゔぁろん"]) expect([typed, machineMatches(BARON, typed)]).toEqual([typed, true])
    expect(machineMatches(WELT, "ウェルト")).toBe(false)
  })

  test("nothing typed finds every machine", () => {
    expect(machineMatches(HIKARI, "  ")).toBe(true)
  })
})

describe("the words a machine is searched by, as typed", () => {
  test("are parted by commas of either width or 、, each trimmed and kept once however it is written", () => {
    expect(readKeywords(" ヴェルヴ、ゲンキ , ＴＧ，tg,, ")).toEqual({ ok: true, value: ["ヴェルヴ", "ゲンキ", "ＴＧ"] })
    expect(readKeywords("  ")).toEqual({ ok: true, value: [] })
  })

  test("are no more and no longer than the catalog takes", () => {
    expect(readKeywords(Array.from({ length: 11 }, (_, index) => `語${index}`).join("、"))).toEqual({ ok: false, error: { type: "too-many-keywords", most: 10 } })
    expect(readKeywords(`ゲンキ、${"あ".repeat(31)}`)).toEqual({ ok: false, error: { type: "keyword-too-long", keyword: "あ".repeat(31), longest: 30 } })
    expect(readKeywords("あ".repeat(30)).ok).toBe(true)
  })
})

describe("a 大当り確率 as typed", () => {
  test("is kept as a spec sheet writes it, whatever its width", () => {
    expect(readHitChance("1/319.7")).toEqual({ ok: true, value: "1/319.7" })
    expect(readHitChance(" １／３９９．９ ")).toEqual({ ok: true, value: "1/399.9" })
    expect(readHitChance("")).toEqual({ ok: true, value: undefined })
  })

  test("is refused when it is not one in so many", () => {
    for (const typed of ["319.7", "1/0", "1/0.5", "2/319", "1/abc", "約1/319", "1/319.7777"]) expect([typed, readHitChance(typed)]).toEqual([typed, { ok: false, error: { type: "not-a-hit-chance" } }])
  })
})

describe("a model name as typed", () => {
  test("is trimmed, and none where nothing was typed", () => {
    expect(readModelName(" e星都幻鬼W ")).toBe("e星都幻鬼W")
    expect(readModelName("  ")).toBeUndefined()
    expect(readModelName("Ｐ　ラブ嬢３Ｈ１ＹＺ６　〜極〜")).toBe("Pラブ嬢3H1YZ6 ~極~")
    expect(readModelName("e／ ワールドダイスター ／L04")).toBe("e/ワールドダイスター/L04")
    expect(readModelName("P/押忍団長 王の頂 / A03")).toBe("P/押忍団長 王の頂/A03")
    expect(readModelName("e／Re:：ノヴァから始まる星間航路 夜明け2／M24")).toBe("e/Re:ノヴァから始まる星間航路 夜明け2/M24")
  })
})

describe("the name a machine goes into a book under", () => {
  test("is its model name, and the name the halls call it only where it has none", () => {
    expect(bookNameOf({ name: "e押忍!団長 王の頂 99ver.", modelName: "e/押忍団長 王の頂/A03" })).toBe("e/押忍団長 王の頂/A03")
    expect(bookNameOf({ name: "スロット ワールドダイスター", modelName: undefined })).toBe("スロット ワールドダイスター")
  })
})
