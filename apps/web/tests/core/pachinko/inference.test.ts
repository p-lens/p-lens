import { describe, expect, test } from "bun:test"

import type { Figures } from "../../../src/core/pachinko/figures"
import { EXCHANGES_AT, TERMS_BY_DEFAULT, ballValueOf, beliefOf, inferredWorthOf, seedOf, termsOf, toldDtoOf, tokenExchangeOf, verdictOf, withRental } from "../../../src/core/pachinko/inference"
import { toPlainString } from "../../../src/core/decimal/decimal"
import { exchangeChoiceText, frequencyBasisText, frequencyText } from "../../../src/ui/wording/pachinko/inference"

/** A machine whose spin wins 14 balls: at 28 to ¥100 its border is 20 spins for ¥1,000. */
const FIGURES: Figures = { roundChanceOneIn: 10, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: undefined }

const summary = (reading: { readonly lower: number; readonly upper: number; readonly effectiveTrials?: number } | null, rarest: number) => ({
  trials: 2_000_000,
  planned: 2_000_000,
  finished: true,
  rarest,
  rarestWay: "takings-at-least" as const,
  reading: reading === null ? null : { lower: reading.lower, middle: (reading.lower + reading.upper) / 2, upper: reading.upper, spins: 300, value: -3750, effectiveTrials: reading.effectiveTrials ?? 5_000 },
})

describe("the terms a told play is weighed on", () => {
  test("say what a ball exchanges for, at either rental, and are read back from the figures kept with a play", () => {
    expect(tokenExchangeOf(TERMS_BY_DEFAULT)).toBe(28)
    expect(ballValueOf({ rental: 4, exchange: "equal" })).toBe(4)
    expect(tokenExchangeOf({ rental: 1, exchange: "30" })).toBe(120)
    expect(termsOf(4, 28)).toEqual(TERMS_BY_DEFAULT)
    expect(termsOf(1, 100)).toEqual({ rental: 1, exchange: "equal" })
    expect(termsOf(2, 28)).toBeUndefined()
    expect(termsOf(4, 33)).toEqual({ rental: 4, exchange: "33" })
    expect(termsOf(1, 132)).toBeUndefined()
  })

  test("scale a cheaper ball's yen up for the engine, which plays every play at ¥4 a ball", () => {
    expect(toldDtoOf({ hours: 3, outlay: 5000, takings: 1000, jackpots: 2 }, { rental: 1, exchange: "28" })).toEqual({ hours: 3, outlay: 20000, takings: 4000, jackpots: 2 })
  })

  test("believe a cabinet a spin under its border before anything is told, give or take a sixth of the border", () => {
    const belief = beliefOf(FIGURES, TERMS_BY_DEFAULT)
    expect([belief.mean, belief.deviation].map((figure) => Number(figure.toFixed(3)))).toEqual([19, 3.333])
    const cheaper = beliefOf(FIGURES, { rental: 1, exchange: "28" })
    expect([cheaper.mean, cheaper.deviation].map((figure) => Number(figure.toFixed(3)))).toEqual([19, 3.333])
  })
})

describe("what a weighing comes to", () => {
  test("is the middle reading, with the worth the trials themselves give, where they say enough — a cheaper ball's scaled back to its own yen", () => {
    const verdict = verdictOf(FIGURES, TERMS_BY_DEFAULT, summary({ lower: 16, upper: 18 }, 400_000))
    expect(verdict.type === "weighed" && [verdict.weighed.spinPerformance, Number(verdict.weighed.border.toFixed(3)), verdict.weighed.theoreticalValue]).toEqual([17, 20, -3750])
    const cheaper = verdictOf(FIGURES, { rental: 1, exchange: "28" }, summary({ lower: 16, upper: 18 }, 400_000))
    expect(cheaper.type === "weighed" && [cheaper.weighed.spinPerformance, Number(cheaper.weighed.border.toFixed(3)), cheaper.weighed.theoreticalValue]).toEqual([68, 80, -937.5])
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
  test("is whole yen with the formula and the terms it stood on, and the spin performance it was taken to have had to a tenth", () => {
    const kept = inferredWorthOf({ spinPerformance: 16.04, border: 20, theoreticalValue: -3749.6 }, "formula-1", { rental: 1, exchange: "30" })
    expect([toPlainString(kept.value), kept.formulaId, toPlainString(kept.tokenRental), toPlainString(kept.tokenExchange), kept.spinPerformance === undefined ? undefined : toPlainString(kept.spinPerformance)]).toEqual(["-3750", "formula-1", "1", "120", "16"])
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
  test("name an exchange by the balls ¥100 of prizes takes at the rental chosen", () => {
    expect(EXCHANGES_AT[4].map((exchange) => exchangeChoiceText({ rental: 4, exchange }))).toEqual(["等価", "28玉", "30玉", "33玉"])
    expect(EXCHANGES_AT[1].map((exchange) => exchangeChoiceText({ rental: 1, exchange }))).toEqual(["等価", "112玉", "120玉"])
  })
  test("keep the exchange across rentals where the other offers it, and take the usual one where not", () => {
    expect(withRental({ rental: 4, exchange: "30" }, 1)).toEqual({ rental: 1, exchange: "30" })
    expect(withRental({ rental: 4, exchange: "33" }, 1)).toEqual({ rental: 1, exchange: "28" })
  })
})
