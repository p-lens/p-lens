import { describe, expect, test } from "bun:test"

import { settlementOf } from "../../src/core/huddle/settlement"

describe("a huddle settled up", () => {
  test("shares what everyone came to evenly, those above their share paying those below it", () => {
    const settled = settlementOf([
      { member: "a", spent: 10_000, prizes: 25_000 },
      { member: "b", spent: 20_000, prizes: 5_000 },
      { member: "c", spent: 5_000, prizes: 11_000 },
    ])
    expect(settled?.result).toBe(6_000)
    expect(settled?.share).toBe(2_000)
    expect(settled?.members.map(({ member, result, due }) => [member, result, due])).toEqual([
      ["a", 15_000, 13_000],
      ["b", -15_000, -17_000],
      ["c", 6_000, 4_000],
    ])
    expect(settled?.transfers).toEqual([
      { from: "a", to: "b", yen: 13_000 },
      { from: "c", to: "b", yen: 4_000 },
    ])
  })

  test("comes to the whole exactly, the yen left over given one each to those first in the list", () => {
    const settled = settlementOf([
      { member: "a", spent: 0, prizes: 10 },
      { member: "b", spent: 0, prizes: 0 },
      { member: "c", spent: 0, prizes: 0 },
    ])
    expect(settled?.members.map(({ due }) => due)).toEqual([6, -3, -3])
    expect(settled?.transfers.reduce((sum, { yen }) => sum + yen, 0)).toBe(6)
  })

  test("shares a loss as it shares a gain, and asks nothing of those already at their share", () => {
    const settled = settlementOf([
      { member: "a", spent: 30_000, prizes: 0 },
      { member: "b", spent: 0, prizes: 0 },
    ])
    expect(settled?.share).toBe(-15_000)
    expect(settled?.transfers).toEqual([{ from: "b", to: "a", yen: 15_000 }])
    expect(settlementOf([{ member: "a", spent: 1_000, prizes: 1_000 }, { member: "b", spent: 0, prizes: 0 }])?.transfers).toEqual([])
  })

  test("is nothing where nobody is in it", () => {
    expect(settlementOf([])).toBeUndefined()
  })
})
