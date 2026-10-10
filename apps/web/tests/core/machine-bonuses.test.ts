import { describe, expect, test } from "bun:test"

import { bonusGain, EMPTY_BONUS_ROW, readBonuses, takesAnotherBonus } from "../../src/core/catalog/bonuses"

describe("a machine's bonuses as typed", () => {
  test("read each row into a bonus, what is spent being none where none is typed", () => {
    expect(readBonuses([{ name: " 10R確変 ", payout: "1,500", spent: "１００" }, { name: "3R通常", payout: "450", spent: "" }])).toEqual({
      ok: true,
      value: [
        { name: "10R確変", payout: 1500, spent: 100 },
        { name: "3R通常", payout: 450, spent: 0 },
      ],
    })
  })

  test("take a row left wholly empty as no bonus, and none typed as none", () => {
    expect(readBonuses([EMPTY_BONUS_ROW])).toEqual({ ok: true, value: [] })
    expect(readBonuses([EMPTY_BONUS_ROW, { name: "10R", payout: "1500", spent: "100" }])).toEqual({ ok: true, value: [{ name: "10R", payout: 1500, spent: 100 }] })
  })

  test("say which row and field is wrong", () => {
    expect(readBonuses([{ name: "", payout: "1500", spent: "" }])).toEqual({ ok: false, error: [{ type: "missing", row: 0, field: "name" }] })
    expect(readBonuses([{ name: "10R", payout: "", spent: "x" }])).toEqual({
      ok: false,
      error: [
        { type: "missing", row: 0, field: "payout" },
        { type: "not-a-count", row: 0, field: "spent" },
      ],
    })
    expect(readBonuses([{ name: "10R", payout: "0", spent: "" }])).toEqual({ ok: false, error: [{ type: "not-a-count", row: 0, field: "payout" }] })
    expect(readBonuses([{ name: "10R", payout: "100001", spent: "" }])).toEqual({ ok: false, error: [{ type: "too-large", row: 0, field: "payout", most: 100000 }] })
    expect(readBonuses([{ name: "10R", payout: "1500", spent: "1500" }])).toEqual({ ok: false, error: [{ type: "not-below-payout", row: 0, field: "spent" }] })
    expect(readBonuses([{ name: "あ".repeat(21), payout: "1500", spent: "" }])).toEqual({ ok: false, error: [{ type: "name-too-long", row: 0, field: "name", longest: 20 }] })
  })

  test("refuse a name another row above already has, however it is written", () => {
    expect(readBonuses([{ name: "10R", payout: "1500", spent: "100" }, { name: "１０Ｒ", payout: "1400", spent: "" }])).toEqual({ ok: false, error: [{ type: "repeated", row: 1, field: "name" }] })
  })

  test("take another row until there are as many as the catalog takes", () => {
    expect(takesAnotherBonus(Array.from({ length: 19 }, () => EMPTY_BONUS_ROW))).toBe(true)
    expect(takesAnotherBonus(Array.from({ length: 20 }, () => EMPTY_BONUS_ROW))).toBe(false)
  })

  test("a bonus adds what it pays out less what is spent winning it", () => {
    expect(bonusGain({ name: "10R", payout: 1500, spent: 100 })).toBe(1400)
  })
})
