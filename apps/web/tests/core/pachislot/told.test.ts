import { describe, expect, test } from "bun:test"

import { toPlainString } from "../../../src/core/decimal/decimal"
import { tokenValueOf } from "../../../src/core/parlor/terms"
import { inferredWorthOf, MEDAL_TERMS_BY_DEFAULT, medalTermsOf, playedGamesOf, playTermsOf, segmentOf } from "../../../src/core/pachislot/told"

describe("a pachislot play told by its totals", () => {
  test("is read from the one stretch its counter showed, a bonus counted none left out", () => {
    expect(segmentOf({ games: 4200, bonuses: { big: 15, reg: 0 } })).toEqual({ games: 4200, counts: [{ id: "big", count: 15 }] })
  })

  test("is weighed over the games its hours come to, on its corner's terms in whole medals", () => {
    expect(playedGamesOf({ hours: 3.5 })).toBe(2450)
    const terms = playTermsOf({ rentedPerThousand: 46, exchangedPerHundred: 5.6 })
    expect(terms.exchange).toEqual({ yen: 10_000, tokens: 560 })
    expect(tokenValueOf(terms)).toBeCloseTo(100 / 5.6, 5)
  })

  test("keeps what its setting level made it worth with the terms it stood on, and gives the terms back as typed", () => {
    const worth = inferredWorthOf("f", 1234.5678912, MEDAL_TERMS_BY_DEFAULT)
    expect([toPlainString(worth.value), worth.formulaId, toPlainString(worth.tokenRental), toPlainString(worth.tokenExchange), worth.spinPerformance]).toEqual(["1234.567891", "f", "21.73913", "5.2", undefined])
    expect(medalTermsOf(worth)).toEqual(MEDAL_TERMS_BY_DEFAULT)
  })
})
