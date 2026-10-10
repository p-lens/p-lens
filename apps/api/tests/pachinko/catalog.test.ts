import { describe, expect, test } from "bun:test"

import { api, device, formulasOf, pachinkoFixture } from "../support/harness"
import { manual, registered, simulated } from "../support/pachinko/formulas"

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
    const renamed = sent.bonuses.map((bonus, index) => ({ ...bonus, name: `大当り${index + 1}` }))
    const made = await send(renamed)
    expect(made.status).toBe(201)
    expect((await formulasOf(client, machineId)).find((formula) => formula.id === made.body.id)?.bonuses).toEqual(renamed)
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

  test("is never changed or deleted once stored", async () => {
    const { client, simulatedId } = await registered(ALICE)
    expect(() => client.sqlite.query("UPDATE formulas SET kind = 'manual' WHERE id = ?1").run(simulatedId)).toThrow(/immutable/)
    expect(() => client.sqlite.query("DELETE FROM formulas WHERE id = ?1").run(simulatedId)).toThrow(/immutable/)
  })
})

describe("a sampled formula", () => {
  test("stands within five standard errors of its basis's exact 1R chance, and keeps how it was sampled", async () => {
    const { client, machineId } = await registered(ALICE)
    const exact = await simulated()
    const sampled = (stray: number) => ({
      ...exact,
      kind: "sampled",
      figures: { roundChanceOneIn: exact.figures.roundChanceOneIn + stray, payoutPerRound: exact.figures.payoutPerRound },
      sampling: { cycles: 100_000, seed: "42", roundChanceMargin: 0.1 },
    })
    expect((await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: sampled(0.2) })).status).toBe(201)
    const far = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: sampled(0.3) })
    expect(far.body.error).toEqual({ type: "figures-disagree-with-basis", field: "roundChanceOneIn" })
    const unsampled = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...sampled(0), sampling: undefined } })
    expect(unsampled.body.error).toEqual({ type: "invalid-body", field: "sampling", reason: "missing" })
    const stored = (await formulasOf(client, machineId)).find((each) => each.kind === "sampled")
    expect(stored.sampling).toEqual({ cycles: 100_000, seed: "42", roundChanceMargin: 0.1 })
    expect(stored.basis.normalized).toBeDefined()
  })
})
