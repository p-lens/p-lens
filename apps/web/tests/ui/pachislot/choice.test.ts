import { describe, expect, test } from "bun:test"

import type { MachineId } from "../../../src/core/machine/machine"
import { withChange } from "../../../src/ui/features/pachislot/start/choice"
import type { PachislotStart } from "../../../src/ui/features/live/start-form"

const nothingChosen: PachislotStart = {
  machine: { type: "none" },
  formulaId: undefined,
  prior: undefined,
  remakeFrom: undefined,
  newMachineName: "",
  newMachineModelName: "",
  newMachineKeywords: "",
  newMachineReleasedOn: "",
  seatTotal: "",
  seatBonuses: {},
  seatAfterReset: false,
  seatSinceCz: "",
  seatMisses: "",
  seatHeld: "",
  seatSinceAtAcrossBonuses: "",
}

const machineId = "01a10afa-94ae-78db-8dbd-c4162a0aaa8c" as MachineId

describe("a pachislot choice in the start form", () => {
  test("a machine chosen from the catalog is the machine the play is for", () => {
    const chosen = withChange(nothingChosen, { machine: { type: "catalog", machineId, name: "テストピエロット" } })
    expect(chosen.machine).toEqual({ type: "catalog", machineId, name: "テストピエロット" })
  })

  test("another machine lets go of what was chosen for the one before, the same machine keeps it", () => {
    const first = withChange(nothingChosen, { machine: { type: "catalog", machineId, name: "テストピエロット" }, prior: { type: "even" }, seatBonuses: { big: "3" } })
    expect(withChange(first, { machine: { type: "catalog", machineId, name: "テストピエロット" } }).prior).toEqual({ type: "even" })
    const other = withChange(first, { machine: { type: "catalog", machineId: "other" as MachineId, name: "ほかの機種" } })
    expect(other.prior).toBeUndefined()
    expect(other.seatBonuses).toEqual({})
  })

  test("letting go of the machine lets go of what was chosen for it", () => {
    const first = withChange(nothingChosen, { machine: { type: "catalog", machineId, name: "テストピエロット" }, prior: { type: "even" }, seatBonuses: { big: "3" } })
    expect(withChange(first, { machine: { type: "none" } })).toEqual(nothingChosen)
  })

  test("any other change leaves the machine and what was chosen for it", () => {
    const first = withChange(nothingChosen, { machine: { type: "catalog", machineId, name: "テストピエロット" }, prior: { type: "even" } })
    const changed = withChange(first, { seatTotal: "1200" })
    expect(changed.machine).toEqual(first.machine)
    expect(changed.prior).toEqual({ type: "even" })
    expect(changed.seatTotal).toBe("1200")
  })
})
