import type { SpecDto } from "@p-lens/contracts/pachinko"
import { describe, expect, test } from "bun:test"

import { bonusNamesOf, bonusShapes, defaultBonusName, namedBonuses } from "../../../src/core/pachinko/bonuses"

const next = { type: "regular" } as const

const SPEC: SpecDto = {
  v: 1,
  entities: ["regular", "rush"],
  components: {
    allotment: {
      regular: [
        { shareBasisPoints: 5000, rounds: 10, next },
        { shareBasisPoints: 5000, rounds: 3, next: { type: "mode", mode: "rush" } },
      ],
      rush: [
        { shareBasisPoints: 7000, rounds: 10, next: { type: "mode", mode: "rush" } },
        { shareBasisPoints: 3000, rounds: 10, prizeBalls: 10, next },
      ],
    },
  },
  resources: { payout: { prizeBalls: 15, count: 10 } },
}

describe("a basis's bonuses, named", () => {
  const shapes = bonusShapes(SPEC)

  test("go by their rounds until they are named, a later one of as many rounds saying which it is", () => {
    expect(shapes.map((_, index) => defaultBonusName(shapes, index))).toEqual(["10R", "3R", "10R(2)"])
    expect(namedBonuses(shapes, {})).toEqual({
      ok: true,
      value: [
        { name: "10R", payout: 1500, spent: 100 },
        { name: "3R", payout: 450, spent: 30 },
        { name: "10R(2)", payout: 1000, spent: 100 },
      ],
    })
  })

  test("take the name typed for their rounds, tidied, and keep what they pay out and take", () => {
    const named = namedBonuses(shapes, { "10x15x10": " １０Ｒ確変 ", "10x10x10": "10R通常" })
    expect(named.ok && named.value.map((bonus) => bonus.name)).toEqual(["10R確変", "3R", "10R通常"])
  })

  test("are refused a name another above has, or one longer than the catalog takes", () => {
    expect(namedBonuses(shapes, { "3x15x10": "１０Ｒ" })).toEqual({ ok: false, error: [{ type: "repeated", index: 1 }] })
    expect(namedBonuses(shapes, { "3x15x10": "あ".repeat(21) })).toEqual({ ok: false, error: [{ type: "name-too-long", index: 1, longest: 20 }] })
  })

  test("come back under their rounds from a formula that named them", () => {
    const named = namedBonuses(shapes, { "10x15x10": "10R確変" })
    if (!named.ok) throw new Error("the names should read")
    expect(bonusNamesOf(SPEC, named.value)).toEqual({ "10x15x10": "10R確変", "3x15x10": "3R", "10x10x10": "10R(2)" })
  })
})

describe("a basis whose machine gives a run of jackpots as one win", () => {
  const RUNS: SpecDto = {
    ...SPEC,
    components: {
      allotment: {
        regular: [{ shareBasisPoints: 10_000, rounds: 10, next: { type: "mode", mode: "rush" } }],
        rush: [
          { shareBasisPoints: 6000, rounds: 10, jackpots: 5, next: { type: "mode", mode: "rush" } },
          { shareBasisPoints: 4000, rounds: 50, jackpots: 5, next: { type: "mode", mode: "rush" } },
        ],
      },
    },
  }

  test("states each bonus with the jackpots it is won over, saying nothing of them where it is one", () => {
    const shapes = bonusShapes(RUNS)
    expect(shapes.map((_, index) => defaultBonusName(shapes, index))).toEqual(["10R", "10R(2)", "50R"])
    expect(namedBonuses(shapes, {})).toEqual({
      ok: true,
      value: [
        { name: "10R", payout: 1500, spent: 100 },
        { name: "10R(2)", payout: 1500, spent: 100, jackpots: 5 },
        { name: "50R", payout: 7500, spent: 500, jackpots: 5 },
      ],
    })
  })
})
