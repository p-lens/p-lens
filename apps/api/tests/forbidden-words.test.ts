import { describe, expect, test } from "bun:test"

import { holdsForbiddenWord } from "../src/domain/forbidden-words"

describe("names that hold a forbidden word", () => {
  test("refuses one standing alone, in any width, case or kana", () => {
    for (const name of ["うんこ", "ウンコ", "ｳﾝｺ", "P うんこ", "ちんこ(甘デジ)", "Ｆｕｃｋ", "う ん こ"]) expect(holdsForbiddenWord(name)).toBe(true)
  })

  test("passes one that only sits inside an ordinary word", () => {
    for (const name of ["ぱちんこ ウルトラマン", "パチンコ CR 森物語", "Pうんこ物語", "e流星の剣10"]) expect(holdsForbiddenWord(name)).toBe(false)
  })
})
