import { describe, expect, test } from "bun:test"

import { findMachines, loadEntry } from "../../src/application/catalog"
import type { Catalog } from "../../src/catalog/port/catalog"
import type { MachineEntry, MachineSummary } from "../../src/core/catalog/catalog"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { MachineId } from "../../src/core/machine/machine"
import { Err, Ok } from "../../src/core/result/result"

const UMI: MachineSummary = { id: "mori" as MachineId, gameKind: "pachinko", name: "Pスーパー森物語", modelName: undefined, keywords: [], hitChance: undefined, releasedOn: "2026-09-01" as IsoDate, formulaCount: 1 }

const unused = async (): Promise<never> => {
  throw new Error("not used here")
}

/** A catalog that only searches and reads, over the machines it is given. */
const catalogOf = (machines: readonly MachineSummary[]): Catalog => ({
  search: async (query, gameKind) => Ok(machines.filter((machine) => machine.gameKind === gameKind && machine.name.includes(query.trim()))),
  read: async (id) => {
    const found = machines.find((machine) => machine.id === id)
    if (found === undefined) return Err({ type: "machine-missing", id })
    const entry: MachineEntry = { gameKind: "pachinko", machine: found, formulas: [] }
    return Ok(entry)
  },
  register: unused,
  addFormula: unused,
  addDistribution: unused,
  quota: unused,
  mark: unused,
  recordUse: unused,
  refresh: unused,
})

describe("findMachines", () => {
  test("an empty query lists every machine of the game", async () => {
    expect(await findMachines(catalogOf([UMI]), "", "pachinko")).toEqual({ ok: true, value: { type: "found", machines: [UMI] } })
    expect(await findMachines(catalogOf([UMI]), "", "pachislot")).toEqual({ ok: true, value: { type: "none-registered" } })
  })

  test("no machine at all is told apart from no machine matching", async () => {
    expect(await findMachines(catalogOf([]), "森", "pachinko")).toEqual({ ok: true, value: { type: "none-registered" } })
    expect(await findMachines(catalogOf([UMI]), "流星", "pachinko")).toEqual({ ok: true, value: { type: "no-match" } })
  })

  test("a catalog that cannot be read says so", async () => {
    const broken: Catalog = { ...catalogOf([]), search: async () => Err({ type: "unavailable", detail: "gone" }) }
    expect((await findMachines(broken, "", "pachinko")).ok).toBe(false)
  })
})

describe("loadEntry", () => {
  test("gives a machine only in the game asked for", async () => {
    expect((await loadEntry(catalogOf([UMI]), "mori", "pachinko")).ok).toBe(true)
    expect(await loadEntry(catalogOf([UMI]), "mori", "pachislot")).toEqual({
      ok: false,
      error: { type: "catalog", error: { type: "other-game", id: "mori", gameKind: "pachinko" } },
    })
  })
})
