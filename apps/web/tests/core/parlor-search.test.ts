import { describe, expect, test } from "bun:test"

import type { SubmissionId } from "../../src/core/parlor/parlor"
import { namesakeOf, parlorMatches, sameParlorName } from "../../src/core/parlor/search"
import type { SharedParlor, SharedParlorId } from "../../src/core/parlor/shared"

const GSTATION: SharedParlor = {
  id: "d" as SharedParlorId,
  name: "ジーステーション第3新東京南口店",
  reading: "じーすてーしょんだいさんしんとうきょうみなみぐちてん",
  keywords: ["G'station", "Gステ"],
  prefecture: "東京都",
  address: "第3新東京1-2-3",
  location: { latitude: 35.69, longitude: 139.7 },
  submissions: [],
}

describe("finding a parlor", () => {
  test("by its name however it is spaced, marked or widened", () => {
    for (const typed of ["ジーステーション", "ジー・ステーション", "ｼﾞｰ ｽﾃｰｼｮﾝ", "第3新東京南口"]) expect([typed, parlorMatches(GSTATION, typed)]).toEqual([typed, true])
  })

  test("by its reading in either kana, and by the words it is known by", () => {
    for (const typed of ["じーすてーしょん", "みなみぐち", "Gステ", "じーすて", "G'station", "G station", "Ｇｓｔａｔｉｏｎ"]) expect([typed, parlorMatches(GSTATION, typed)]).toEqual([typed, true])
  })

  test("not by what it is not, and by anything at all before anything is typed", () => {
    expect(parlorMatches(GSTATION, "メガコンドル")).toBe(false)
    expect(parlorMatches(GSTATION, "  ")).toBe(true)
  })
})

describe("one name", () => {
  test("is a name whatever its widths, case, spaces and marks", () => {
    for (const other of ["ジー ステーション 第3新東京南口店", "ｼﾞｰｽﾃｰｼｮﾝ第3新東京南口店", "ジー・ステーション第3新東京南口店"]) expect([other, sameParlorName(GSTATION.name, other)]).toEqual([other, true])
    expect(sameParlorName(GSTATION.name, "ジーステーション第3新東京東口店")).toBe(false)
  })

  test("is a name whether it is written with ヴ or in the バ row", () => {
    expect(sameParlorName("ヴェガスペガサス小宇宙店", "ベガスペガサス小宇宙店")).toBe(true)
    expect(sameParlorName("ヴェガスペガサス小宇宙店", "ウェガスペガサス小宇宙店")).toBe(false)
  })

  test("is taken by a listed parlor, unless the list made that parlor from the submission", () => {
    const listed = [{ ...GSTATION, submissions: ["sub_01" as SubmissionId] }]
    expect(namesakeOf(listed, "ジー ステーション 第3新東京南口店", "sub_02" as SubmissionId)).toEqual(listed[0])
    expect(namesakeOf(listed, "ジー ステーション 第3新東京南口店", "sub_01" as SubmissionId)).toBeUndefined()
    expect(namesakeOf(listed, "ジーステーション第3新東京東口店", "sub_02" as SubmissionId)).toBeUndefined()
  })
})
