import { describe, expect, test } from "bun:test"

import { EVERY_TALLY, isNarrowed, matchesNothing, narrowedTo, rateKey, ratesInOrder, readRateKey } from "../../src/core/report/narrowing"

describe("a breakdown's narrowing", () => {
  test("puts one dimension's choice in place of the last, every group again where it chooses every one", () => {
    expect(narrowedTo(EVERY_TALLY, "parlor", ["店A"])).toEqual({ parlor: ["店A"] })
    expect(narrowedTo({ game: ["pachinko"], parlor: ["店A"] }, "parlor", ["店B"])).toEqual({ game: ["pachinko"], parlor: ["店B"] })
    expect(narrowedTo({ game: ["pachinko"], parlor: ["店A"] }, "game", undefined)).toEqual({ parlor: ["店A"] })
  })

  test("is narrowed while any dimension chooses, and matches nothing where one chooses none", () => {
    expect([isNarrowed(EVERY_TALLY), isNarrowed({ machine: ["台X"] }), isNarrowed({ machine: [] })]).toEqual([false, true, true])
    expect([matchesNothing(EVERY_TALLY), matchesNothing({ machine: ["台X"] }), matchesNothing({ game: ["pachinko"], machine: [] })]).toEqual([false, false, true])
  })
  test("keys a rate by its kind of token and its price, and reads back only what a rate is written as", () => {
    expect(rateKey({ kind: "medal", tier: "20円" })).toBe("medal:20円")
    expect([readRateKey("ball:4円"), readRateKey("ball:0.5円"), readRateKey("coin:4円"), readRateKey("ball:"), readRateKey("4円")]).toEqual([{ kind: "ball", tier: "4円" }, { kind: "ball", tier: "0.5円" }, undefined, undefined, undefined])
  })
})

describe("rates as a filter offers them", () => {
  test("are each once, the dearest first whichever kind of token, balls first at the same price", () => {
    expect(ratesInOrder(["ball:1円", "medal:5円", "ball:4円", "medal:20円", "medal:4円", "ball:4円"])).toEqual(["medal:20円", "medal:5円", "ball:4円", "medal:4円", "ball:1円"])
  })
})
