import { describe, expect, test } from "bun:test"

import { analyze } from "@p-lens/pachinko-engine/pachinko.js"

import { api, device, formulasOf, pachinkoFixture } from "../support/harness"
import { bonusesOf, manual, registered, simulated } from "../support/pachinko/formulas"

const ALICE = device(1_759_000_000_001)
const BOB = device(1_759_000_000_002)

describe("a simulated formula", () => {
  test("stores the normalised spec the engine made, not one anyone sent", async () => {
    const { client, machineId, simulatedId } = await registered(ALICE)
    const formula = (await formulasOf(client, machineId)).find((each) => each.id === simulatedId)
    expect(formula.basis.normalized).toEqual(await pachinkoFixture("made-up", "normalized.json"))
    expect(formula.basis.conditions).toEqual({ roundPayout: { type: "from-spec" } })
    expect(formula.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  test("is refused when its figures are not what its basis comes to", async () => {
    const { client, machineId } = await registered(ALICE)
    const sent = await simulated()
    const reply = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...sent, figures: { ...sent.figures, payoutPerRound: 150 } } })
    expect(reply.status).toBe(422)
    expect(reply.body.error).toEqual({ type: "figures-disagree-with-basis", field: "payoutPerRound" })
  })

  test("names the bonuses its basis's jackpots pay and no others: their balls are the basis's, never the sender's", async () => {
    const { client, machineId } = await registered(ALICE)
    const sent = await simulated()
    const send = (bonuses: unknown) => client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...sent, bonuses } })
    const disagrees = { type: "figures-disagree-with-basis", field: "bonuses" }
    expect((await send([])).body.error).toEqual(disagrees)
    expect((await send(sent.bonuses.slice(1))).body.error).toEqual(disagrees)
    expect((await send(sent.bonuses.map((bonus, index) => (index === 0 ? { ...bonus, payout: bonus.payout + 1 } : bonus)))).body.error).toEqual(disagrees)
    expect((await send(sent.bonuses.map((bonus, index) => (index === 0 ? { ...bonus, jackpots: 2 } : bonus)))).body.error).toEqual(disagrees)
    const renamed = sent.bonuses.map((bonus, index) => ({ ...bonus, name: `大当り${index + 1}` }))
    const made = await send(renamed)
    expect(made.status).toBe(201)
    expect((await formulasOf(client, machineId)).find((formula) => formula.id === made.body.id)?.bonuses).toEqual(renamed)
  })

  test("states of a bonus won over several jackpots as many as its basis's share does, and comes to no other figures for it", async () => {
    const { client, machineId } = await registered(ALICE)
    const sent = await simulated()
    const world = sent.basis.spec
    const rush = (world.components.allotment?.["RUSH"] ?? []).map((share) => ({ ...share, jackpots: 2 }))
    const spec = { ...world, components: { ...world.components, allotment: { ...world.components.allotment, RUSH: rush } } }
    const send = (bonuses: unknown) => client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...sent, basis: { ...sent.basis, spec }, bonuses } })
    expect((await send(sent.bonuses)).body.error).toEqual({ type: "figures-disagree-with-basis", field: "bonuses" })
    const made = await send(bonusesOf(spec))
    expect(made.status).toBe(201)
    const kept = (await formulasOf(client, machineId)).find((formula) => formula.id === made.body.id)
    expect(kept?.bonuses.map((bonus: { readonly jackpots?: number }) => bonus.jackpots)).toEqual([undefined, 2])
    expect(kept?.basis.normalized.states[0].outcomes[0].hits).toBe(2)
  })

  test("takes a support gain into the figures it is held to, keeps it, and keeps none where it is nought or left out", async () => {
    const { client, machineId } = await registered(ALICE)
    const sent = await simulated()
    const conditions = { roundPayout: { type: "from-spec" }, supportGain: { basisPoints: -1000 } } as const
    const analysis = JSON.parse(analyze(JSON.stringify({ source: { type: "spec", spec: sent.basis.spec }, conditions })))
    const send = (body: unknown) => client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body })
    expect((await send({ ...sent, basis: { ...sent.basis, conditions } })).body.error).toEqual({ type: "figures-disagree-with-basis", field: "payoutPerRound" })
    const figures = { ...sent.figures, roundChanceOneIn: analysis.value.roundChanceOneIn, payoutPerRound: analysis.value.ballsPerRound }
    const made = await send({ ...sent, figures, basis: { ...sent.basis, conditions } })
    expect(made.status).toBe(201)
    expect((await formulasOf(client, machineId)).find((formula) => formula.id === made.body.id)?.basis.conditions).toEqual(conditions)
    const nought = await send({ ...sent, basis: { ...sent.basis, conditions: { roundPayout: { type: "from-spec" }, supportGain: { basisPoints: 0 } } } })
    expect((await formulasOf(client, machineId)).find((formula) => formula.id === nought.body.id)?.basis.conditions).toEqual({ roundPayout: { type: "from-spec" } })
    expect((await send({ ...sent, basis: { ...sent.basis, conditions: { roundPayout: { type: "from-spec" }, supportGain: { basisPoints: -10_000 } } } })).body.error).toMatchObject({ field: "basis.conditions.supportGain" })
  })

  test("is refused when the engine cannot read its basis, in the engine's own terms", async () => {
    const { client, machineId } = await registered(ALICE)
    const sent = await simulated()
    const world = sent.basis.spec
    const spec = { ...world, components: { ...world.components, allotment: { ...world.components.allotment, regular: [] } } }
    const reply = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...sent, basis: { ...sent.basis, spec } } })
    expect(reply.status).toBe(422)
    expect(reply.body.error).toEqual({ type: "basis-rejected", error: { type: "invalid-distribution", at: { type: "regular" }, sumBasisPoints: 0 } })
  })

  test("is refused when its spec is of a version the engine does not read, or says none", async () => {
    const { client, machineId } = await registered(ALICE)
    const sent = await simulated()
    const later = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...sent, basis: { ...sent.basis, spec: { ...sent.basis.spec, v: 2 } } } })
    expect(later.status).toBe(422)
    expect(later.body.error).toEqual({ type: "basis-rejected", error: { type: "unsupported-spec-version", version: 2, known: 1 } })
    const { v: _unsaid, ...unversioned } = sent.basis.spec
    const unsaid = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...sent, basis: { ...sent.basis, spec: unversioned } } })
    expect(unsaid.status).toBeGreaterThanOrEqual(400)
    expect(unsaid.status).toBeLessThan(500)
  })

  test("is refused when its spec holds a table of components the engine does not know, by the table's name", async () => {
    const { client, machineId } = await registered(ALICE)
    const sent = await simulated()
    const spec = { ...sent.basis.spec, components: { ...sent.basis.spec.components, chargeZone: { RUSH: { spins: 4 } } } }
    const reply = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...sent, basis: { ...sent.basis, spec } } })
    expect(reply.status).toBe(422)
    expect(reply.body.error).toEqual({ type: "basis-rejected", error: { type: "unsupported-component", field: "spec.components.chargeZone" } })
  })

  test("cannot be added to a machine that does not exist", async () => {
    const client = await api()
    const reply = await client.call("POST", `/machines/${device(1_759_000_000_009)}/formulas`, { as: ALICE, body: manual() })
    expect(reply.status).toBe(404)
    expect(reply.body.error).toEqual({ type: "not-found", what: "machine" })
  })

  test("keeps the version of the engine that checked its figures, where one a formula typed in has none", async () => {
    const { client, manualId, simulatedId } = await registered(ALICE)
    const normalized = await pachinkoFixture("made-up", "normalized.json")
    const checking = JSON.parse(analyze(JSON.stringify({ source: { type: "normalized", normalized }, conditions: { roundPayout: { type: "from-spec" } } }))).value.engineVersion
    const versionOf = (id: string) => (client.sqlite.query("SELECT engine_version AS version FROM formulas WHERE id = ?1").get(id) as { version: number | null }).version
    expect([versionOf(simulatedId), versionOf(manualId)]).toEqual([checking, null])
    expect(checking).toBeGreaterThan(0)
  })

  test("is never changed or deleted once stored", async () => {
    const { client, simulatedId } = await registered(ALICE)
    expect(() => client.sqlite.query("UPDATE formulas SET kind = 'manual' WHERE id = ?1").run(simulatedId)).toThrow(/immutable/)
    expect(() => client.sqlite.query("DELETE FROM formulas WHERE id = ?1").run(simulatedId)).toThrow(/immutable/)
  })
})

describe("a sampled formula", () => {
  test("is not taken, whatever margin it states for its 1R chance: only what a basis comes to exactly is kept", async () => {
    const { client, machineId } = await registered(ALICE)
    const exact = await simulated()
    const sampled = (stray: number, roundChanceMargin: number) => ({
      ...exact,
      kind: "sampled",
      figures: { roundChanceOneIn: exact.figures.roundChanceOneIn + stray, payoutPerRound: exact.figures.payoutPerRound },
      sampling: { cycles: 100_000, seed: "42", roundChanceMargin },
    })
    const before = (await formulasOf(client, machineId)).map((each) => each.id)
    for (const body of [sampled(0, 0.1), sampled(0.2, 0.1), sampled(50, 1_000_000)])
      expect((await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body })).body.error).toEqual({ type: "invalid-body", field: "kind", reason: "unknown-value" })
    expect((await formulasOf(client, machineId)).map((each) => each.id)).toEqual(before)
  })
})
