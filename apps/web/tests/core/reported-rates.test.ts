import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { rateUnreported, reportedRatesOf, type PrizeObservation, type TierReport } from "../../src/core/parlor/reported-rates"
import type { SharedParlorId } from "../../src/core/parlor/shared"

const PARLOR = "op:yark:1" as SharedParlorId
const TODAY = "2026-11-13" as IsoDate

const tier = (change: Partial<TierReport>): TierReport => ({ parlor: PARLOR, checked: "2026-10-01" as IsoDate, game: "pachinko", tier: "4円", rental: undefined, prizes: {}, ...change })

const seen = (change: Partial<PrizeObservation>): PrizeObservation => ({ parlor: PARLOR, observedOn: "2026-10-01" as IsoDate, game: "pachinko", tier: "4円", prize: undefined, tokens: undefined, yen: 500, ...change })

describe("what players reported of a parlor's corners", () => {
  test("a rental told alone and an exchange told alone both count", () => {
    const rates = reportedRatesOf([tier({ rental: 250 })], [seen({ tokens: 140, yen: 500 })], TODAY)
    expect(rates.get(PARLOR)).toEqual({ pachinko: { rentalTokens: 250, exchange: { tokens: 140, yen: 500 } } })
  })

  test("the later report stands over the earlier, field by field", () => {
    const rates = reportedRatesOf(
      [tier({ rental: 250, checked: "2026-10-01" as IsoDate }), tier({ prizes: { 小: 140 }, checked: "2026-10-05" as IsoDate }), tier({ rental: 240, checked: "2026-10-03" as IsoDate })],
      [seen({ tokens: 140, yen: 500, observedOn: "2026-10-09" as IsoDate }), seen({ tokens: 280, yen: 1000, observedOn: "2026-10-02" as IsoDate })],
      TODAY,
    )
    expect(rates.get(PARLOR)?.pachinko).toEqual({ rentalTokens: 240, exchange: { tokens: 140, yen: 500 } })
  })

  test("a wrong report that holds is put right by the next one, on the same day as well", () => {
    const day = "2026-11-13" as IsoDate
    const rates = reportedRatesOf([tier({ rental: 125, checked: day }), tier({ rental: 250, checked: day })], [seen({ tokens: 125, yen: 500, observedOn: day }), seen({ tokens: 140, yen: 500, observedOn: day })], TODAY)
    expect(rates.get(PARLOR)?.pachinko).toEqual({ rentalTokens: 250, exchange: { tokens: 140, yen: 500 } })
  })

  test("a value at another rate is passed over, the one before it standing", () => {
    const rates = reportedRatesOf(
      [tier({ game: "pachislot", tier: "20円", rental: 46 }), tier({ game: "pachislot", tier: "20円", rental: 446, checked: "2026-10-21" as IsoDate })],
      [seen({ game: "pachislot", tier: "20円", tokens: 26, yen: 500 }), seen({ game: "pachislot", tier: "20円", tokens: 250, yen: 500, observedOn: "2026-10-21" as IsoDate })],
      TODAY,
    )
    expect(rates.get(PARLOR)?.pachislot).toEqual({ rentalTokens: 46, exchange: { tokens: 26, yen: 500 } })
  })

  test("a prize seen by its name takes the tokens the corner's report gives it", () => {
    const rates = reportedRatesOf([tier({ prizes: { 中: 280 } })], [seen({ prize: "中", yen: 1000 }), seen({ prize: "特大", yen: 5000, observedOn: "2026-10-02" as IsoDate })], TODAY)
    expect(rates.get(PARLOR)?.pachinko?.exchange).toEqual({ tokens: 280, yen: 1000 })
  })

  test("a change announced ahead is not in force before its day", () => {
    const rates = reportedRatesOf([tier({ rental: 250 }), tier({ rental: 240, checked: "2026-12-01" as IsoDate })], [], TODAY)
    expect(rates.get(PARLOR)?.pachinko?.rentalTokens).toBe(250)
  })

  test("only the 4-yen and 20-yen corners are read", () => {
    const rates = reportedRatesOf([tier({ tier: "1円", rental: 1000 }), tier({ game: "pachislot", tier: "5円", rental: 200 })], [seen({ tier: "1円", tokens: 560 })], TODAY)
    expect(rates.has(PARLOR)).toBe(false)
  })

  test("a corner is asked for until both its rental and its exchange are reported", () => {
    expect(rateUnreported(undefined)).toBe(true)
    expect(rateUnreported({ rentalTokens: 250, exchange: undefined })).toBe(true)
    expect(rateUnreported({ rentalTokens: 250, exchange: { tokens: 140, yen: 500 } })).toBe(false)
  })
})
