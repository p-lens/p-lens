import { describe, expect, test } from "bun:test"

import type { Figures } from "../../../src/core/pachinko/figures"
import { TERMS_BY_DEFAULT, ballValueOf, beliefOf, inferredWorthOf, scaledBallValueOf, seedOf, toldDtoOf, verdictOf, weighingTermsOf } from "../../../src/core/pachinko/inference"
import { borderOf } from "../../../src/core/pachinko/theoretical-value"
import { decimal, parseDecimal, toPlainString, type Decimal } from "../../../src/core/decimal/decimal"
import { frequencyBasisText, frequencyText } from "../../../src/ui/wording/pachinko/inference"

const dec = (text: string): Decimal => ((parsed) => (parsed.ok ? parsed.value : decimal(0n, 0)))(parseDecimal(text))

/** A machine whose spin wins 14 balls: at 28 to ¥100 its border is 20 spins for ¥1,000. */
const FIGURES: Figures = { roundChanceOneIn: 10, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: undefined }

const summary = (reading: { readonly lower: number; readonly upper: number; readonly effectiveTrials?: number; readonly ownShare?: number } | null, rarest: number) => ({
  trials: 2_000_000,
  planned: 2_000_000,
  finished: true,
  rarest,
  rarestWay: "takings-at-least" as const,
  reading: reading === null ? null : { lower: reading.lower, middle: (reading.lower + reading.upper) / 2, upper: reading.upper, spins: 300, value: -3750, effectiveTrials: reading.effectiveTrials ?? 5_000, ownShare: reading.ownShare ?? 0 },
})

describe("the terms a told play is weighed on", () => {
  test("say what a ball exchanges for, and are read back from the figures kept with a play, as they are written now and as they once were", () => {
    expect(TERMS_BY_DEFAULT).toEqual({ rentedPerThousand: 250, exchangedPerHundred: 28 })
    expect(ballValueOf({ rentedPerThousand: 250, exchangedPerHundred: 25 })).toBe(4)
    expect(weighingTermsOf({ tokenRental: decimal(4n, 0), tokenExchange: decimal(28n, 0) })).toEqual(TERMS_BY_DEFAULT)
    expect(weighingTermsOf({ tokenRental: decimal(1n, 0), tokenExchange: decimal(120n, 0) })).toEqual({ rentedPerThousand: 1000, exchangedPerHundred: 120 })
    expect(weighingTermsOf({ tokenRental: decimal(4n, 0), tokenExchange: decimal(33n, 0) })).toEqual({ rentedPerThousand: 250, exchangedPerHundred: 33 })
    expect(weighingTermsOf({ tokenRental: dec("4.166667"), tokenExchange: dec("27.5") })).toEqual({ rentedPerThousand: 240, exchangedPerHundred: 27.5 })
    expect(weighingTermsOf({ tokenRental: decimal(0n, 0), tokenExchange: decimal(28n, 0) })).toBeUndefined()
    expect(weighingTermsOf({ tokenRental: decimal(4n, 0), tokenExchange: decimal(-28n, 0) })).toBeUndefined()
  })

  test("weigh a ¥4 ball at 250 to ¥1,000 exchanged at 28 as the engine's own play, and a ¥1 ball at 1,000 as before", () => {
    expect(toldDtoOf({ hours: 3, outlay: 5000, takings: 1000, jackpots: 2 }, TERMS_BY_DEFAULT)).toEqual({ hours: 3, outlay: 5000, takings: 1000, jackpots: 2 })
    expect(scaledBallValueOf(TERMS_BY_DEFAULT)).toBe(100 / 28)
    expect(scaledBallValueOf({ rentedPerThousand: 1000, exchangedPerHundred: 112 })).toBe(100 / 28)
  })

  test("scale a corner renting 240 to ¥1,000 by 240/250", () => {
    const terms = { rentedPerThousand: 240, exchangedPerHundred: 27.5 }
    expect(toldDtoOf({ hours: 3, outlay: 5000, takings: 1000, jackpots: undefined }, terms)).toEqual({ hours: 3, outlay: 4800, takings: 960 })
    expect(scaledBallValueOf(terms)).toBeCloseTo((100 / 27.5) * (240 / 250), 12)
    const verdict = verdictOf(FIGURES, terms, summary({ lower: 16, upper: 18 }, 400_000))
    expect(verdict.type === "weighed" && [verdict.weighed.spinPerformance, Number(verdict.weighed.border.toFixed(3)), verdict.weighed.theoreticalValue]).toEqual([17 * 0.96, Number((1000 / (14 * (100 / 27.5))).toFixed(3)), -3750 / 0.96])
  })

  test("scale a cheaper ball's yen up for the engine, which plays every play at ¥4 a ball", () => {
    expect(toldDtoOf({ hours: 3, outlay: 5000, takings: 1000, jackpots: 2 }, { rentedPerThousand: 1000, exchangedPerHundred: 112 })).toEqual({ hours: 3, outlay: 20000, takings: 4000, jackpots: 2 })
  })

  test("believe a cabinet a spin under its border before anything is told, give or take a sixth of the border", () => {
    const belief = beliefOf(FIGURES, TERMS_BY_DEFAULT)
    expect([belief.mean, belief.deviation].map((figure) => Number(figure.toFixed(3)))).toEqual([19, 3.333])
    const cheaper = beliefOf(FIGURES, { rentedPerThousand: 1000, exchangedPerHundred: 112 })
    expect([cheaper.mean, cheaper.deviation].map((figure) => Number(figure.toFixed(3)))).toEqual([19, 3.333])
  })
})

describe("what a weighing comes to", () => {
  test("is the middle reading, with the worth the trials themselves give, where they say enough — a cheaper ball's scaled back to its own yen", () => {
    const verdict = verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 18 }, 400_000))
    expect(verdict.type === "weighed" && [verdict.weighed.spinPerformance, Number(verdict.weighed.border.toFixed(3)), verdict.weighed.theoreticalValue]).toEqual([17, 20, -3750])
    const cheaper = verdictOf(FIGURES, { rentedPerThousand: 1000, exchangedPerHundred: 112 }, summary({ lower: 16, upper: 18 }, 400_000))
    expect(cheaper.type === "weighed" && [cheaper.weighed.spinPerformance, Number(cheaper.weighed.border.toFixed(3)), cheaper.weighed.theoreticalValue]).toEqual([68, 80, -937.5])
  })

  test("sets the border where so much of what was played was the play's own, a won ball costing what it exchanges for", () => {
    const allRented = verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 18, ownShare: 0 }, 400_000))
    expect(allRented.type === "weighed" && [allRented.weighed.ownShare, Number(allRented.weighed.border.toFixed(3))]).toEqual([0, Number(borderOf(FIGURES, 100 / 28).toFixed(3))])
    const verdict = verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 18, ownShare: 0.5 }, 400_000))
    expect(verdict.type === "weighed" && [verdict.weighed.ownShare, Number(verdict.weighed.border.toFixed(3))]).toEqual([0.5, Number((((0.5 * 4 + 0.5 * (100 / 28)) / (14 * (100 / 28))) * 250).toFixed(3))])
    const allOwn = verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 18, ownShare: 1 }, 400_000))
    expect(allOwn.type === "weighed" && Number(allOwn.weighed.border.toFixed(3))).toBe(Number((250 / 14).toFixed(3)))
  })

  test("is an anomaly before anything else where a play so far out comes more seldom than once in a thousand", () => {
    expect(verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 18 }, 166))).toEqual({ type: "anomalous", oneIn: 2_000_000 / 166, beyond: false, way: "takings-at-least" })
    expect(verdictOf(FIGURES, TERMS_BY_DEFAULT, summary(null, 0))).toEqual({ type: "anomalous", oneIn: 2_000_000, beyond: true, way: "takings-at-least" })
    expect(verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 18 }, 2_000)).type).toBe("weighed")
  })

  test("is too little to read where few trials came near, or those that did say hardly more than was believed", () => {
    expect(verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 18, effectiveTrials: 100 }, 400_000))).toEqual({ type: "vague", why: "few-near" })
    expect(verdictOf(FIGURES, TERMS_BY_DEFAULT, summary(null, 400_000))).toEqual({ type: "vague", why: "few-near" })
    expect(verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 19.7 }, 400_000))).toEqual({ type: "vague", why: "wide" })
    expect(verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 19.5 }, 400_000)).type).toBe("weighed")
  })
})

describe("what a play was taken to be worth, as kept", () => {
  test("is yen to six places with the formula and the terms it stood on, and the spin performance it was taken to have had to a tenth", () => {
    const kept = inferredWorthOf({ spinPerformance: 16.04, ownShare: 0, border: 20, theoreticalValue: -3749.61234567 }, "formula-1", { rentedPerThousand: 1000, exchangedPerHundred: 120 })
    expect([toPlainString(kept.value), kept.formulaId, toPlainString(kept.tokenRental), toPlainString(kept.tokenExchange), kept.spinPerformance === undefined ? undefined : toPlainString(kept.spinPerformance)]).toEqual(["-3749.612346", "formula-1", "1", "120", "16"])
  })

  test("keep a ball's yen to six places where ¥1,000 does not divide by the balls it rents, and the exchange to its places, and read back as typed", () => {
    const kept = inferredWorthOf({ spinPerformance: 16, ownShare: 0, border: 20, theoreticalValue: 0 }, "formula-1", { rentedPerThousand: 240, exchangedPerHundred: 27.5 })
    expect([toPlainString(kept.tokenRental), toPlainString(kept.tokenExchange)]).toEqual(["4.166667", "27.5"])
    expect(weighingTermsOf(kept)).toEqual({ rentedPerThousand: 240, exchangedPerHundred: 27.5 })
    expect(weighingTermsOf(inferredWorthOf({ spinPerformance: 16, ownShare: 0, border: 20, theoreticalValue: 0 }, "formula-1", TERMS_BY_DEFAULT))).toEqual(TERMS_BY_DEFAULT)
  })

  test("is weighed from a seed its id always gives", () => {
    expect(seedOf("precord-20190102-730d261d")).toBe(seedOf("precord-20190102-730d261d"))
    expect(seedOf("a")).not.toBe(seedOf("b"))
    expect(seedOf("a")).toMatch(/^\d+$/)
  })
})

describe("the words of a weighing", () => {
  test("say how seldom a play comes to two figures, and what that figure is of", () => {
    expect(frequencyText(2_000_000 / 166, false)).toBe("約12,000回に1回")
    expect(frequencyText(1234, false)).toBe("約1,200回に1回")
    expect(frequencyText(2_000_000, true)).toBe("再現できませんでした")
    expect(frequencyBasisText(2_000_000, true, "outlay-at-least")).toBe("200万回のシミュレーションでの結果（この機種・仮定した条件で投資額がこれ以上になる展開）")
    expect(frequencyBasisText(12_000, false, "result-at-least")).toBe("この機種・仮定した条件で収支がこれ以上になる推定発生頻度")
  })
})
