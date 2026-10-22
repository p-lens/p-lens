import { describe, expect, test } from "bun:test"

import { cornerOf, exchangeRateOf, poolOf, savingsDeductedFor, tierOf, tokensRentedFor, UNKNOWN_TIER, type PlayTerms } from "../../src/core/parlor/terms"
import { dec } from "../support/values"

const terms = (rental: [number, number], exchange: [number, number], replay: [number, number] = [250, 275]): PlayTerms => ({
  rental: { yen: rental[0], tokens: rental[1] },
  exchange: { yen: exchange[0], tokens: exchange[1] },
  replay: { paidOut: replay[0], deducted: replay[1] },
})

describe("a corner's terms", () => {
  test("name the advertised rate however the board writes its numbers", () => {
    expect(tierOf("pachinko", terms([1000, 250], [1000, 280]))).toBe("4円")
    expect(tierOf("pachinko", terms([500, 125], [500, 140]))).toBe("4円")
    expect(tierOf("pachinko", terms([1000, 890], [1000, 1120]))).toBe("1円")
    expect(tierOf("pachinko", terms([200, 178], [200, 224]))).toBe("1円")
    expect(tierOf("pachinko", terms([1000, 1000], [1000, 1000]))).toBe("1円")
    expect(tierOf("pachislot", terms([1000, 46], [1000, 56]))).toBe("20円")
  })

  test("round the rental down and the exchange up, and call a board that disagrees a rate unknown", () => {
    expect(tierOf("pachinko", terms([1000, 250], [1000, 250]))).toBe("4円")
    expect(tierOf("pachinko", terms([1000, 1000], [1000, 280]))).toBe(UNKNOWN_TIER)
  })

  test("keep the exchange rate as a ratio to six places, and work out rentals and replays in the parlor's favour", () => {
    expect(exchangeRateOf(terms([1000, 250], [1000, 280]))).toEqual(dec("3.571429"))
    expect(tokensRentedFor(terms([1000, 250], [1000, 280]), 12000)).toBe(3000)
    expect(tokensRentedFor(terms([1000, 890], [1000, 1120]), 500)).toBe(445)
    expect(savingsDeductedFor(terms([1000, 250], [1000, 280], [250, 275]), 1000)).toBe(1100)
    expect(savingsDeductedFor(terms([1000, 250], [1000, 280], [250, 275]), 10)).toBe(11)
    expect(poolOf("pachislot", terms([1000, 46], [1000, 56]))).toEqual({ kind: "medal", tier: "20円" })
  })
})

describe("a corner as a player calls it", () => {
  const renting = (yen: number, tokens: number) => ({ rental: { yen, tokens }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 125 } })

  test("is the dearest rate it rents at or above, with its game, whatever it exchanges at", () => {
    expect(cornerOf("pachinko", renting(1000, 250))).toBe("4円パチ")
    expect(cornerOf("pachinko", renting(1000, 240))).toBe("4円パチ")
    expect(cornerOf("pachinko", renting(1000, 500))).toBe("2円パチ")
    expect(cornerOf("pachinko", renting(1000, 890))).toBe("1円パチ")
    expect(cornerOf("pachislot", renting(1000, 46))).toBe("20円スロ")
    expect(cornerOf("pachislot", renting(1000, 100))).toBe("10円スロ")
    expect(cornerOf("pachislot", renting(1000, 125))).toBe("8円スロ")
    expect(cornerOf("pachislot", renting(1000, 200))).toBe("5円スロ")
  })

  test("is at a rate unknown on no terms, or below every rate", () => {
    expect(cornerOf("pachinko", undefined)).toBe("レート不明パチ")
    expect(cornerOf("pachislot", renting(1000, 10000))).toBe("レート不明スロ")
  })
})
