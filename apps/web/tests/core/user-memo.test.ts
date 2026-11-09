import { describe, expect, test } from "bun:test"

import { userMemoIn, userMemoOf, userMemoTags } from "../../src/core/tally/user-memo"
import { notesSays } from "../../src/ui/wording/user-tags"

describe("the note a person writes a tally down with", () => {
  test("is on one line, what would end a tag given way to, nothing on either side, and an empty one none", () => {
    expect(userMemoOf(" 朝イチ据え,\n狙い目: 12番台 ")).toBe("朝イチ据え， 狙い目： 12番台")
    expect(userMemoTags("角台が甘い")).toEqual([["user-memo", "角台が甘い"]])
    expect(userMemoTags("  ")).toEqual([])
    expect(userMemoTags(undefined)).toEqual([])
  })

  test("is read back from an entry's tags, undefined where there is none", () => {
    expect(userMemoIn([["play-id", "x"], ["user-tag", "イベント"], ["user-memo", "角台が甘い"]])).toBe("角台が甘い")
    expect(userMemoIn([["play-id", "x"], ["user-memo", " "]])).toBeUndefined()
    expect(userMemoIn([["play-id", "x"]])).toBeUndefined()
  })

  test("is told of by the notes button beside the tags it holds", () => {
    expect(notesSays(false, 0, "")).toBe("タグ・メモを開く")
    expect(notesSays(true, 2, "")).toBe("タグ・メモを閉じる（タグ2件）")
    expect(notesSays(false, 0, "角台")).toBe("タグ・メモを開く（メモあり）")
    expect(notesSays(false, 1, "角台")).toBe("タグ・メモを開く（タグ1件・メモあり）")
  })
})
