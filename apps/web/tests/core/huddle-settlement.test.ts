import { describe, expect, test } from "bun:test"

import { SETTLING_STEP, settlementOf } from "../../src/core/huddle/settlement"

describe("a huddle settled up", () => {
  test("shares what everyone came to evenly, those above their share paying those below it", () => {
    const settled = settlementOf([
      { member: "a", spent: 10_000, prizes: 25_000 },
      { member: "b", spent: 20_000, prizes: 5_000 },
      { member: "c", spent: 5_000, prizes: 11_000 },
    ], 1)
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
    ], 1)
    expect(settled?.members.map(({ due }) => due)).toEqual([6, -3, -3])
    expect(settled?.transfers.reduce((sum, { yen }) => sum + yen, 0)).toBe(6)
  })

  test("shares a loss as it shares a gain, and asks nothing of those already at their share", () => {
    const settled = settlementOf([
      { member: "a", spent: 30_000, prizes: 0 },
      { member: "b", spent: 0, prizes: 0 },
    ], 1)
    expect(settled?.share).toBe(-15_000)
    expect(settled?.transfers).toEqual([{ from: "b", to: "a", yen: 15_000 }])
    expect(settlementOf([{ member: "a", spent: 1_000, prizes: 1_000 }, { member: "b", spent: 0, prizes: 0 }], 1)?.transfers).toEqual([])
  })

  test("pays in thousands, those who came to most holding the odd yen", () => {
    const settled = settlementOf([
      { member: "a", spent: 10_000, prizes: 25_400 },
      { member: "b", spent: 20_000, prizes: 5_200 },
      { member: "c", spent: 5_000, prizes: 8_100 },
    ], SETTLING_STEP)
    expect(settled?.result).toBe(3_700)
    expect(settled?.members.map(({ result, due }) => result - due)).toEqual([1_400, 1_200, 1_100])
    expect(settled?.transfers).toEqual([
      { from: "a", to: "b", yen: 14_000 },
      { from: "c", to: "b", yen: 2_000 },
    ])
  })

  test("pays a loss in thousands too, the one who lost least holding the odd yen", () => {
    const settled = settlementOf([
      { member: "a", spent: 30_500, prizes: 0 },
      { member: "b", spent: 0, prizes: 0 },
    ], SETTLING_STEP)
    expect(settled?.members.map(({ result, due }) => result - due)).toEqual([-15_500, -15_000])
    expect(settled?.transfers).toEqual([{ from: "b", to: "a", yen: 15_000 }])
  })

  test("is nothing where nobody is in it", () => {
    expect(settlementOf([], SETTLING_STEP)).toBeUndefined()
  })
})
