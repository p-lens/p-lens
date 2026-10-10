import { describe, expect, test } from "bun:test"

import type { SubmissionId } from "../../src/core/parlor/parlor"
import { namesakeOf, parlorMatches, sameParlorName } from "../../src/core/parlor/search"
import type { SharedParlor, SharedParlorId } from "../../src/core/parlor/shared"

const DSTATION: SharedParlor = {
  id: "d" as SharedParlorId,
  name: "D'station新宿南口店",
  reading: "でぃーすてーしょんしんじゅくみなみぐちてん",
  keywords: ["Dステ"],
  prefecture: "東京都",
  address: "新宿区西新宿1-2-3",
  location: { latitude: 35.69, longitude: 139.7 },
  submissions: [],
}

describe("finding a parlor", () => {
  test("by its name however it is spaced, marked or widened", () => {
    for (const typed of ["D'station", "D station", "dstation", "Ｄｓｔａｔｉｏｎ", "新宿南口"]) expect([typed, parlorMatches(DSTATION, typed)]).toEqual([typed, true])
  })

  test("by its reading in either kana, and by the words it is known by", () => {
    for (const typed of ["でぃーすてーしょん", "ディーステーション", "ﾃﾞｨｰｽﾃｰｼｮﾝ", "みなみぐち", "Dステ", "でぃーすて"]) expect([typed, parlorMatches(DSTATION, typed)]).toEqual([typed, true])
  })

  test("not by what it is not, and by anything at all before anything is typed", () => {
    expect(parlorMatches(DSTATION, "ルミナ")).toBe(false)
    expect(parlorMatches(DSTATION, "  ")).toBe(true)
  })
})

describe("one name", () => {
  test("is a name whatever its widths, case, spaces and marks", () => {
    for (const other of ["D station 新宿南口店", "Ｄｓｔａｔｉｏｎ新宿南口店", "dstation新宿南口店"]) expect([other, sameParlorName(DSTATION.name, other)]).toEqual([other, true])
    expect(sameParlorName(DSTATION.name, "D'station新宿東口店")).toBe(false)
  })

  test("is taken by a listed parlor, unless the list made that parlor from the submission", () => {
    const listed = [{ ...DSTATION, submissions: ["sub_01" as SubmissionId] }]
    expect(namesakeOf(listed, "D station 新宿南口店", "sub_02" as SubmissionId)).toEqual(listed[0])
    expect(namesakeOf(listed, "D station 新宿南口店", "sub_01" as SubmissionId)).toBeUndefined()
    expect(namesakeOf(listed, "D'station新宿東口店", "sub_02" as SubmissionId)).toBeUndefined()
  })
})
