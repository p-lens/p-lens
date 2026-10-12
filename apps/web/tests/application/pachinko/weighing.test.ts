import { describe, expect, test } from "bun:test"

import { weighToldPlay, type Weighing } from "../../../src/application/pachinko/inference"
import { TERMS_BY_DEFAULT, TRIALS_BEYOND, TRIALS_BY_HAND } from "../../../src/core/pachinko/inference"
import type { PlayId } from "../../../src/core/play/play"
import { Ok } from "../../../src/core/result/result"

const FORMULA = { id: "formula-1", figures: { roundChanceOneIn: 10, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: undefined }, kind: "simulated", basis: { normalized: {}, conditions: {} } }

const catalog = (formulas: readonly unknown[]) => ({ read: async (id: string) => Ok({ gameKind: "pachinko", machine: { id }, formulas: formulas.map((formula) => ({ formula, standing: { adoptions: 0, rejections: 0, uses: 0 } })) }) })

const ASKED = { machineId: "sea", playId: "play-1" as PlayId, told: { hours: 4, outlay: 20000, takings: 0, jackpots: undefined }, terms: TERMS_BY_DEFAULT }

/** An engine that answers each run at once with the reading its trials are given, and remembers what it was asked. */
const engineAnswering = (effectiveTrials: (trials: number) => number, rarest: (trials: number) => number = (trials) => trials / 10) => {
  const asked: number[] = []
  return {
    asked,
    infer: (order: { readonly trials: number }, onEvent: (event: unknown) => void) => {
      asked.push(order.trials)
      queueMicrotask(() => onEvent({ type: "completed", summary: { trials: order.trials, planned: order.trials, finished: true, rarest: rarest(order.trials), rarestWay: "result-at-most", reading: { lower: 16, middle: 17, upper: 18, spins: 800, value: -9000, effectiveTrials: effectiveTrials(order.trials) } } }))
      return { cancel: () => undefined }
    },
  }
}

const weighed = async (catalogue: unknown, engine: unknown): Promise<readonly Weighing[]> => {
  const said: Weighing[] = []
  weighToldPlay(catalogue as never, engine as never, ASKED, TRIALS_BY_HAND, (weighing) => void said.push(weighing))
  await new Promise((settled) => setTimeout(settled, 20))
  return said
}

describe("a told play weighed", () => {
  test("is played out the usual number of times and read where enough trials came near", async () => {
    const engine = engineAnswering(() => 5_000)
    const said = await weighed(catalog([FORMULA]), engine)
    expect(engine.asked).toEqual([TRIALS_BY_HAND])
    expect(said.map((each) => each.type)).toEqual(["weighing", "weighed"])
    expect(said.at(-1)).toEqual({ type: "weighed", formulaId: "formula-1", paceAssumed: true, weighed: { spinPerformance: 17, border: 20, theoreticalValue: -9000 } })
  })

  test("is played out again, many more times, where too few came near, and read from that", async () => {
    const engine = engineAnswering((trials) => (trials === TRIALS_BY_HAND ? 40 : 200))
    const said = await weighed(catalog([FORMULA]), engine)
    expect(engine.asked).toEqual([TRIALS_BY_HAND, TRIALS_BEYOND])
    expect(said.map((each) => each.type)).toEqual(["weighing", "weighed"])
  })

  test("is given up as telling too little where too few came near even then, and never played out a third time", async () => {
    const engine = engineAnswering(() => 40)
    const said = await weighed(catalog([FORMULA]), engine)
    expect(engine.asked).toEqual([TRIALS_BY_HAND, TRIALS_BEYOND])
    expect(said.at(-1)).toEqual({ type: "vague", jackpotsTold: false })
  })

  test("is reported out of the ordinary at once, without being played out again", async () => {
    const engine = engineAnswering(() => 40, () => 166)
    const said = await weighed(catalog([FORMULA]), engine)
    expect(engine.asked).toEqual([TRIALS_BY_HAND])
    expect(said.at(-1)).toEqual({ type: "anomalous", oneIn: TRIALS_BY_HAND / 166, beyond: false, way: "result-at-most" })
  })

  test("is not weighed where it took no cash, and nothing is played out for it", async () => {
    const engine = engineAnswering(() => 5_000)
    const said: Weighing[] = []
    weighToldPlay(catalog([FORMULA]) as never, engine as never, { ...ASKED, told: { ...ASKED.told, outlay: 0, takings: 5000 } }, TRIALS_BY_HAND, (weighing) => void said.push(weighing))
    await new Promise((settled) => setTimeout(settled, 20))
    expect(engine.asked).toEqual([])
    expect(said).toEqual([{ type: "unweighable", why: "no-outlay" }])
  })

  test("is not weighed where its machine has only figures typed in", async () => {
    const engine = engineAnswering(() => 5_000)
    const said = await weighed(catalog([{ ...FORMULA, kind: "manual", basis: undefined }]), engine)
    expect(engine.asked).toEqual([])
    expect(said.at(-1)).toEqual({ type: "unweighable", why: "no-basis" })
  })
})
