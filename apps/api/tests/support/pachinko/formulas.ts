import type { RegisterMachineDto } from "@p-lens/contracts"
import { bonusShapesOf, type NewFormulaDto, roundsOf, type SpecDto } from "@p-lens/contracts/pachinko"

import { api, pachinkoFixture } from "../harness"

export const manual = (roundChanceOneIn = 13.9, payoutPerRound = 140): NewFormulaDto => ({ kind: "manual", figures: { roundChanceOneIn, payoutPerRound }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] })

/** The bonuses a spec's jackpots pay, each named for its rounds: what a formula worked out from it states. */
export const bonusesOf = (spec: SpecDto): NewFormulaDto["bonuses"] => bonusShapesOf(spec).map((shape) => ({ name: `${roundsOf(shape)}R ${shape.key}`, payout: shape.payout, spent: shape.spent, ...(shape.jackpots === 1 ? {} : { jackpots: shape.jackpots }) }))

/** The fixture spec as a simulated formula, its figures as the engine solves them. */
export const simulated = async (): Promise<NewFormulaDto & { readonly basis: NonNullable<NewFormulaDto["basis"]> }> => {
  const expected = await pachinkoFixture("made-up", "expected.json")
  const spec: SpecDto = await pachinkoFixture("made-up", "spec.json")
  return {
    kind: "simulated",
    figures: { roundChanceOneIn: expected.roundChanceOneIn, payoutPerRound: expected.ballsPerRound, spinsPerHour: 220 },
    basis: { spec, conditions: { roundPayout: { type: "from-spec" } } },
    bonuses: bonusesOf(spec),
  }
}

/** A machine registered by a device with a manual formula, and a simulated one added to it. */
export const registered = async (as: string) => {
  const client = await api()
  const machine = await client.call("POST", "/machines", { as, body: { gameKind: "pachinko", modelName: "型式A1", hitChance: "1/319.7", name: "流星無双", releasedOn: "2026-08-04", formula: manual() } satisfies RegisterMachineDto })
  const added = await client.call("POST", `/machines/${machine.body.machineId}/formulas`, { as, body: await simulated() })
  return { client, machineId: machine.body.machineId as string, manualId: machine.body.formulaId as string, simulatedId: added.body.id as string }
}
