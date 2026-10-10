import { describe, expect, test } from "bun:test"

import { tokenValueOf } from "../../src/core/parlor/terms"
import { readTerms, replayFeeOf, replayPaysMoreThanItTakes, termsAsOpened, termsFormOf } from "../../src/ui/features/live/start-terms"

const OPENED = termsAsOpened({ rentalTokens: "250", exchangeTokens: "280", replayTokens: "125" })

const FILLED = { rentalTokens: "250", exchangeTokens: "280", replayPaidOut: "250", replayDeducted: "275" }

describe("the start form's terms", () => {
  test("read the tokens ¥1,000 is for, and a replay's counts, into a corner's terms", () => {
    expect(readTerms(FILLED)).toEqual({
      ok: true,
      value: { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 275 } },
    })
  })

  test("are set out again from a corner's terms as they were typed, whatever sum the terms were stated for", () => {
    const read = readTerms(FILLED)
    expect(read.ok && termsFormOf(read.value)).toEqual(FILLED)
    expect(termsFormOf({ rental: { yen: 500, tokens: 125 }, exchange: { yen: 100, tokens: 28 }, replay: { paidOut: 125, deducted: 133 } })).toEqual({ rentalTokens: "250", exchangeTokens: "280", replayPaidOut: "125", replayDeducted: "133" })
  })

  test("read numbers typed full-width as the numbers they are", () => {
    expect(readTerms({ ...FILLED, rentalTokens: "２５０", exchangeTokens: "　２８０　" })).toEqual(readTerms(FILLED))
  })

  test("name every field that is not a whole number above zero", () => {
    expect(readTerms({ ...FILLED, exchangeTokens: "", replayDeducted: "0", rentalTokens: "1.5" })).toEqual({ ok: false, error: ["rentalTokens", "exchangeTokens", "replayDeducted"] })
  })

  test("state the rental and the exchange for ¥1,000, whatever is typed: 28玉交換 is 3.57 yen a ball", () => {
    const read = readTerms(FILLED)
    expect(read.ok && tokenValueOf(read.value)).toBeCloseTo(1000 / 280, 5)
  })

  test("open with the usual rates and a replay that takes what it pays out, so a usual corner needs nothing typed", () => {
    expect(OPENED).toEqual({ rentalTokens: "250", exchangeTokens: "280", replayPaidOut: "125", replayDeducted: "125" })
    expect(readTerms(OPENED)).toEqual({
      ok: true,
      value: { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 125 } },
    })
  })

  test("say a replay takes a fee unless it takes exactly what it pays out", () => {
    expect(replayFeeOf(OPENED)).toBe("none")
    expect(replayFeeOf({ ...OPENED, replayDeducted: "133" })).toBe("charged")
    expect(replayFeeOf({ ...OPENED, replayPaidOut: " 125", replayDeducted: "１２５" })).toBe("none")
    expect(replayFeeOf({ ...OPENED, replayPaidOut: "", replayDeducted: "" })).toBe("charged")
  })
})

describe("a replay that pays out more than it takes", () => {
  test("is told apart from one that takes as much or more, and from terms that do not read", () => {
    expect(replayPaysMoreThanItTakes({ ...FILLED, replayPaidOut: "275", replayDeducted: "250" })).toBe(true)
    expect(replayPaysMoreThanItTakes(FILLED)).toBe(false)
    expect(replayPaysMoreThanItTakes(OPENED)).toBe(false)
    expect(replayPaysMoreThanItTakes({ ...FILLED, replayPaidOut: "275", replayDeducted: "" })).toBe(false)
  })
})
