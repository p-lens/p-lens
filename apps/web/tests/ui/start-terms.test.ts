import { describe, expect, test } from "bun:test"

import { tokenValueOf } from "../../src/core/parlor/terms"
import { readTerms, replayFeeOf, replayPaysMoreThanItTakes, termsAsOpened, termsFormOf } from "../../src/ui/features/live/start-terms"

const OPENED = termsAsOpened({ rentalTokens: "250", exchange: "28.0", replayTokens: "125" })

const FILLED = { rentalTokens: "250", exchange: "28.0", replayPaidOut: "250", replayDeducted: "275" }

describe("the start form's terms", () => {
  test("read the tokens ¥1,000 rents, the tokens ¥100 is exchanged for, and a replay's counts, into a corner's terms", () => {
    expect(readTerms(FILLED, "pachinko")).toEqual({
      ok: true,
      value: { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 275 } },
    })
  })

  test("are set out again from a corner's terms as they were typed, whatever sum the terms were stated for", () => {
    const read = readTerms(FILLED, "pachinko")
    expect(read.ok && termsFormOf(read.value, "pachinko")).toEqual(FILLED)
    expect(termsFormOf({ rental: { yen: 500, tokens: 125 }, exchange: { yen: 100, tokens: 28 }, replay: { paidOut: 125, deducted: 133 } }, "pachinko")).toEqual({ rentalTokens: "250", exchange: "28.0", replayPaidOut: "125", replayDeducted: "133" })
  })

  test("read numbers typed full-width as the numbers they are", () => {
    expect(readTerms({ ...FILLED, rentalTokens: "２５０", exchange: "　２８　" }, "pachinko")).toEqual(readTerms(FILLED, "pachinko"))
  })

  test("name every field that is not a whole number above zero", () => {
    expect(readTerms({ ...FILLED, exchange: "", replayDeducted: "0", rentalTokens: "1.5" }, "pachinko")).toEqual({ ok: false, error: ["rentalTokens", "exchange", "replayDeducted"] })
  })

  test("value a ball by the exchange, whatever is typed: 28玉交換 is 3.57 yen a ball", () => {
    const read = readTerms(FILLED, "pachinko")
    expect(read.ok && tokenValueOf(read.value)).toBeCloseTo(1000 / 280, 5)
  })

  test("open with the usual rates and a replay that takes what it pays out, so a usual corner needs nothing typed", () => {
    expect(OPENED).toEqual({ rentalTokens: "250", exchange: "28.0", replayPaidOut: "125", replayDeducted: "125" })
    expect(readTerms(OPENED, "pachinko")).toEqual({
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

describe("a pachislot corner's exchange, stated for ¥100", () => {
  const SLOT = { rentalTokens: "46", exchange: "5.15", replayPaidOut: "23", replayDeducted: "23" }

  test("reads to two places as whole medals for ¥10,000, and is set out again as it was stated", () => {
    const read = readTerms(SLOT, "slot")
    expect(read).toEqual({ ok: true, value: { rental: { yen: 1000, tokens: 46 }, exchange: { yen: 10_000, tokens: 515 }, replay: { paidOut: 23, deducted: 23 } } })
    expect(read.ok && termsFormOf(read.value, "slot")).toEqual(SLOT)
    expect(readTerms({ ...SLOT, exchange: "５．１" }, "slot")).toMatchObject({ ok: true, value: { exchange: { yen: 10_000, tokens: 510 } } })
  })

  test("sets terms kept for ¥1,000 out as stated for ¥100, to both places: 52枚 is 5.20", () => {
    expect(termsFormOf({ rental: { yen: 1000, tokens: 46 }, exchange: { yen: 1000, tokens: 52 }, replay: { paidOut: 23, deducted: 23 } }, "slot").exchange).toBe("5.20")
  })

  test("refuses more than two places, none, and nothing; pachinko's is said to one", () => {
    expect(readTerms({ ...SLOT, exchange: "5.155" }, "slot")).toEqual({ ok: false, error: ["exchange"] })
    expect(readTerms({ ...SLOT, exchange: "0.00" }, "slot")).toEqual({ ok: false, error: ["exchange"] })
    expect(readTerms({ ...SLOT, exchange: "5." }, "slot")).toEqual({ ok: false, error: ["exchange"] })
    expect(readTerms({ ...FILLED, exchange: "27.55" }, "pachinko")).toEqual({ ok: false, error: ["exchange"] })
  })
})

describe("a pachinko corner's exchange, stated for ¥100", () => {
  test("reads to one place: 27.5玉 is 275 for ¥1,000, set out again as 27.5", () => {
    const read = readTerms({ ...FILLED, exchange: "27.5" }, "pachinko")
    expect(read).toMatchObject({ ok: true, value: { exchange: { yen: 1000, tokens: 275 } } })
    expect(read.ok && termsFormOf(read.value, "pachinko").exchange).toBe("27.5")
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
