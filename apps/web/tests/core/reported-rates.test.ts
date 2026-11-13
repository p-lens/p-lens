import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { exchangedCorners, rateUnreported, rentalOfCorner, reportedRateAt, reportedRatesOf, type PrizeObservation, type TierReport } from "../../src/core/parlor/reported-rates"
import type { SharedParlorId } from "../../src/core/parlor/shared"

const PARLOR = "op:yark:1" as SharedParlorId
const TODAY = "2026-11-13" as IsoDate

const tier = (change: Partial<TierReport>): TierReport => ({ parlor: PARLOR, checked: "2026-10-01" as IsoDate, game: "pachinko", tier: "4円", rental: undefined, replay: undefined, prizes: {}, ...change })

const seen = (change: Partial<PrizeObservation>): PrizeObservation => ({ parlor: PARLOR, observedOn: "2026-10-01" as IsoDate, game: "pachinko", tier: "4円", prize: undefined, tokens: undefined, yen: 500, ...change })

const at4 = (tiers: readonly TierReport[], observations: readonly PrizeObservation[]) => reportedRateAt(reportedRatesOf(tiers, observations, TODAY), PARLOR, "pachinko", "4円")

describe("what players reported of a parlor's corners", () => {
  test("a rental told alone and an exchange told alone both count", () => {
    expect(at4([tier({ rental: 250 })], [seen({ tokens: 140, yen: 500 })])).toEqual({ rentalTokens: 250, exchange: { tokens: 140, yen: 500 }, replay: undefined })
  })

  test("the later report stands over the earlier, field by field", () => {
    const rate = at4(
      [tier({ rental: 250, checked: "2026-10-01" as IsoDate }), tier({ prizes: { 小: 140 }, replay: { paidOut: 125, deducted: 133 }, checked: "2026-10-05" as IsoDate }), tier({ rental: 240, checked: "2026-10-03" as IsoDate })],
      [seen({ tokens: 140, yen: 500, observedOn: "2026-10-09" as IsoDate }), seen({ tokens: 280, yen: 1000, observedOn: "2026-10-02" as IsoDate })],
    )
    expect(rate).toEqual({ rentalTokens: 240, exchange: { tokens: 140, yen: 500 }, replay: { paidOut: 125, deducted: 133 } })
  })

  test("a wrong report that holds is put right by the next one, on the same day as well", () => {
    const day = "2026-11-13" as IsoDate
    expect(at4([tier({ rental: 125, checked: day }), tier({ rental: 250, checked: day })], [seen({ tokens: 125, yen: 500, observedOn: day }), seen({ tokens: 140, yen: 500, observedOn: day })])).toMatchObject({ rentalTokens: 250, exchange: { tokens: 140, yen: 500 } })
  })

  test("a value at another rate is passed over, the one before it standing", () => {
    const rates = reportedRatesOf(
      [tier({ game: "pachislot", tier: "20円", rental: 46 }), tier({ game: "pachislot", tier: "20円", rental: 446, checked: "2026-10-21" as IsoDate })],
      [seen({ game: "pachislot", tier: "20円", tokens: 26, yen: 500 }), seen({ game: "pachislot", tier: "20円", tokens: 250, yen: 500, observedOn: "2026-10-21" as IsoDate })],
      TODAY,
    )
    expect(reportedRateAt(rates, PARLOR, "pachislot", "20円")).toMatchObject({ rentalTokens: 46, exchange: { tokens: 26, yen: 500 } })
  })

  test("a prize seen by its name takes the tokens the corner's report gives it", () => {
    expect(at4([tier({ prizes: { 中: 280 } })], [seen({ prize: "中", yen: 1000 }), seen({ prize: "特大", yen: 5000, observedOn: "2026-10-02" as IsoDate })])?.exchange).toEqual({ tokens: 280, yen: 1000 })
  })

  test("a change announced ahead is not in force before its day", () => {
    expect(at4([tier({ rental: 250 }), tier({ rental: 240, checked: "2026-12-01" as IsoDate })], [])?.rentalTokens).toBe(250)
  })

  test("every corner is read, each by its own rate", () => {
    const rates = reportedRatesOf([tier({ tier: "1円", rental: 1000 }), tier({ tier: "1円", rental: 250, checked: "2026-10-02" as IsoDate })], [seen({ tier: "1円", tokens: 560 })], TODAY)
    expect(reportedRateAt(rates, PARLOR, "pachinko", "1円")).toEqual({ rentalTokens: 1000, exchange: { tokens: 560, yen: 500 }, replay: undefined })
  })

  test("only the corners a broker was seen to pay for may be chosen, dearest first", () => {
    const rates = reportedRatesOf([tier({ tier: "2円", rental: 500 })], [seen({ tier: "1円", tokens: 560 }), seen({ tier: "4円", tokens: 140 })], TODAY)
    expect(exchangedCorners(rates, PARLOR, "pachinko")).toEqual(["4円", "1円"])
    expect(exchangedCorners(rates, PARLOR, "pachislot")).toEqual([])
  })

  test("a chosen corner rents what was reported, or what its rate names where nothing was", () => {
    expect(rentalOfCorner({ rentalTokens: 240, exchange: undefined, replay: undefined }, "pachinko", "4円")).toBe(240)
    expect(rentalOfCorner(undefined, "pachinko", "4円")).toBe(250)
    expect(rentalOfCorner(undefined, "pachinko", "0.5円")).toBe(2000)
    expect(rentalOfCorner(undefined, "pachislot", "20円")).toBe(46)
    expect(rentalOfCorner(undefined, "pachislot", "5円")).toBe(184)
  })

  test("a corner is asked for until both its rental and its exchange are reported", () => {
    expect(rateUnreported(undefined)).toBe(true)
    expect(rateUnreported({ rentalTokens: 250, exchange: undefined, replay: undefined })).toBe(true)
    expect(rateUnreported({ rentalTokens: 250, exchange: { tokens: 140, yen: 500 }, replay: undefined })).toBe(false)
  })
})
