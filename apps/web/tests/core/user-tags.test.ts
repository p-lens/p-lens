import { describe, expect, test } from "bun:test"

import { offeredUserTags, userTagTags, userTagsByUse, userTagsIn, userTagsOf } from "../../src/core/tally/user-tags"

describe("the words a person tags a tally with", () => {
  test("are each once, in the order given, an empty one none, what would end a tag given way to", () => {
    expect(userTagsOf(["イベント", " 朝一 ", "イベント", "", "旧,イベ:"])).toEqual(["イベント", "朝一", "旧，イベ："])
    expect(userTagTags(["イベント", "朝一"])).toEqual([["user-tag", "イベント"], ["user-tag", "朝一"]])
    expect(userTagTags(undefined)).toEqual([])
    expect(userTagsIn([["play-id", "x"], ["user-tag", "イベント"], ["source-label", "朝一"], ["user-tag", "据え置き"]])).toEqual(["イベント", "据え置き"])
  })

  test("are offered those the book used most first, the first met first among as many, mine and another app's alike, then the preset ones it has not", () => {
    const used = userTagsByUse(
      [
        [["user-tag", "朝一"]],
        [["user-tag", "イベント"], ["user-tag", "朝一"]],
        [["source-label", "イベント"]],
        [["source-label", "ハイエナ"], ["play-id", "x"]],
        [["user-tag", "イベント"]],
      ],
      ["user-tag", "source-label"],
    )
    expect(used).toEqual(["イベント", "朝一", "ハイエナ"])
    expect(offeredUserTags(used, ["イベント", "据え置き", "ハイエナ", "新台"])).toEqual(["イベント", "朝一", "ハイエナ", "据え置き", "新台"])
  })
})
