import { describe, expect, test } from "bun:test"

import { readSavingsAccount, savingsAccount } from "../../src/core/journal/accounts"
import { parlorsFromDeclarations } from "../../src/core/parlor/parlor"

describe("parlors", () => {
  test("are read off the savings accounts declared for them, one pool per kind and rate", () => {
    expect(
      parlorsFromDeclarations([
        { name: "資産", tags: [["type", "A"]] },
        { name: "資産:貯玉:マレハン東京皇国店:4円", tags: [["parlor-id", "malehan-tokyokoukoku"]] },
        { name: "資産:貯玉:723修羅の国店:4円", tags: [["parlor-id", "723-shuranokuni"]] },
        { name: "資産:貯玉:マレハン東京皇国店:1円", tags: [["parlor-id", "malehan-tokyokoukoku"]] },
        { name: "資産:貯メダル:マレハン東京皇国店:20円", tags: [["parlor-id", "malehan-tokyokoukoku"]] },
        { name: "資産:貯玉:タグ無し店:4円", tags: [] },
      ]),
    ).toEqual([
      {
        identity: { type: "listed", id: "malehan-tokyokoukoku" },
        name: "マレハン東京皇国店",
        pools: [
          { kind: "ball", tier: "4円" },
          { kind: "ball", tier: "1円" },
          { kind: "medal", tier: "20円" },
        ],
      },
      { identity: { type: "listed", id: "723-shuranokuni" }, name: "723修羅の国店", pools: [{ kind: "ball", tier: "4円" }] },
    ] as never)
  })

  test("a parlor waiting on a submission is read by it, and as listed once the list's id stands beside it", () => {
    expect(
      parlorsFromDeclarations([
        { name: "資産:貯玉:新店:4円", tags: [["parlor-submission", "sub_01"]] },
        { name: "資産:貯玉:載った店:4円", tags: [["parlor-submission", "sub_02"], ["parlor-id", "osm-9"]] },
      ]),
    ).toEqual([
      { identity: { type: "submitted", submission: "sub_01" }, name: "新店", pools: [{ kind: "ball", tier: "4円" }] },
      { identity: { type: "listed", id: "osm-9" }, name: "載った店", pools: [{ kind: "ball", tier: "4円" }] },
    ] as never)
  })

  test("savings accounts are named and read back the same way", () => {
    expect(savingsAccount("medal", "723修羅の国店", "20円")).toBe("資産:貯メダル:723修羅の国店:20円")
    expect(readSavingsAccount("資産:貯メダル:723修羅の国店:20円")).toEqual({ kind: "medal", parlorName: "723修羅の国店", tier: "20円" })
    expect(readSavingsAccount("資産:貯玉")).toBeUndefined()
    expect(readSavingsAccount("資産:貯玉:店")).toBeUndefined()
    expect(readSavingsAccount("資産:貯玉:店:4円:奥")).toBeUndefined()
    expect(readSavingsAccount("資産:現金")).toBeUndefined()
  })
})
