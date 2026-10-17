import { describe, expect, test } from "bun:test"

import { addFormula } from "../../../src/application/pachislot/formulas"
import type { Catalog, CatalogError, Solved, Submitted } from "../../../src/catalog/port/catalog"
import type { NewPachislotFormula } from "../../../src/core/catalog/catalog"
import type { MachineId } from "../../../src/core/machine/machine"
import { Err, Ok, type Result } from "../../../src/core/result/result"

const MACHINE = "01a1239a-0000-7000-8000-000000000001" as MachineId

const FORMULA = { kind: "manual", figures: [], basis: {}, derivedFrom: undefined } as unknown as NewPachislotFormula

/** A catalog answering each sending in turn, and keeping who was to solve each one. */
const answering = (answers: readonly Result<Submitted, CatalogError>[]): { readonly catalog: Catalog; readonly sent: Solved[] } => {
  const sent: Solved[] = []
  const catalog = {
    addFormula: async (_machineId: MachineId, _formula: unknown, solved: Solved = "by-catalog") => {
      sent.push(solved)
      return answers[sent.length - 1] ?? Err({ type: "refused", reason: "none-left" })
    },
  } as unknown as Catalog
  return { catalog, sent }
}

const TAKEN = Ok({ machineId: MACHINE, id: "formula" })

describe("sharing a pachislot formula", () => {
  test("taken as it is, it is checked and sent once", async () => {
    const { catalog, sent } = answering([TAKEN])
    const told: string[] = []
    const shared = await addFormula(catalog, MACHINE, FORMULA, () => told.push("again"))
    expect(shared).toEqual(Ok({ machineId: MACHINE, id: "formula", unchecked: false }))
    expect(sent).toEqual(["by-catalog"])
    expect(told).toEqual([])
  })

  test("too heavy for the catalog, it goes again with what the device solved, and is taken unchecked", async () => {
    const { catalog, sent } = answering([Err({ type: "too-heavy" }), TAKEN])
    const told: string[] = []
    const shared = await addFormula(catalog, MACHINE, FORMULA, () => told.push("again"))
    expect(shared).toEqual(Ok({ machineId: MACHINE, id: "formula", unchecked: true }))
    expect(sent).toEqual(["by-catalog", "on-device"])
    expect(told).toEqual(["again"])
  })

  test("refused for anything else, it is not sent again", async () => {
    const { catalog, sent } = answering([Err({ type: "refused", reason: "figures-disagree-with-basis" })])
    const shared = await addFormula(catalog, MACHINE, FORMULA, () => undefined)
    expect(shared.ok).toBe(false)
    expect(sent).toEqual(["by-catalog"])
  })
})
