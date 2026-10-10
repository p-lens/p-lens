import { describe, expect, test } from "bun:test"

import { type AllotmentDto, bonusShapesOf, roundsOf, type SpecDto } from "../../src/pachinko/engine.ts"

const next = { type: "regular" } as const

type Shares = readonly AllotmentDto[]

const specOf = (regular: Shares, rush: Shares): SpecDto => ({
  v: 1,
  entities: ["regular", "rush"],
  components: { allotment: { regular, rush } },
  resources: { payout: { prizeBalls: 15, count: 10 } },
})

describe("the bonuses a spec's jackpots pay", () => {
  test("are told by their rounds alone: the same rounds through the same attacker are one bonus, whatever their share and wherever they lead", () => {
    const spec = specOf(
      [
        { shareBasisPoints: 5000, rounds: 10, next },
        { shareBasisPoints: 5000, rounds: 10, next: { type: "mode", mode: "rush" } },
      ],
      [{ shareBasisPoints: 10_000, rounds: 3, next }],
    )
    expect(bonusShapesOf(spec).map((shape) => [roundsOf(shape), shape.payout, shape.spent])).toEqual([
      [10, 1500, 100],
      [3, 450, 30],
    ])
  })

  test("that only happen to pay out the same balls are two", () => {
    const spec = specOf(
      [
        { shareBasisPoints: 5000, rounds: 10, next },
        { shareBasisPoints: 5000, rounds: 15, prizeBalls: 10, next },
      ],
      [{ shareBasisPoints: 10_000, rounds: 10, next }],
    )
    expect(bonusShapesOf(spec).map((shape) => [shape.key, shape.payout, shape.spent])).toEqual([
      ["10x15x10", 1500, 100],
      ["15x10x10", 1500, 150],
    ])
  })

  test("count every round whichever attacker it opens, rounds through the same one after another being one run", () => {
    const spec = specOf(
      [{ shareBasisPoints: 10_000, rounds: 1, prizeBalls: 1, next, otherRounds: [{ rounds: 4 }, { rounds: 5 }, { rounds: 2, prizeBalls: 12, count: 5 }] }],
      [{ shareBasisPoints: 10_000, rounds: 1, next, otherRounds: [{ rounds: 9 }] }],
    )
    const [first, second] = bonusShapesOf(spec)
    expect(first?.rounds).toEqual([
      { rounds: 1, prizeBalls: 1, count: 10 },
      { rounds: 9, prizeBalls: 15, count: 10 },
      { rounds: 2, prizeBalls: 12, count: 5 },
    ])
    expect([first?.payout, first?.spent, first === undefined ? 0 : roundsOf(first)]).toEqual([10 + 1350 + 120, 10 + 90 + 10, 12])
    expect(second?.key).toBe("10x15x10")
  })
})
