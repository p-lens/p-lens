import { describe, expect, test } from "bun:test"

import { exchangeRateOf, poolOf, savingsDeductedFor, tierOf, tokensRentedFor, UNKNOWN_TIER, type PlayTerms } from "../../src/core/parlor/terms"
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
    expect(tierOf("slot", terms([1000, 46], [1000, 56]))).toBe("20円")
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
    expect(poolOf("slot", terms([1000, 46], [1000, 56]))).toEqual({ kind: "medal", tier: "20円" })
  })
})
