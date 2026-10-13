import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { machineNamesOf } from "../../src/core/catalog/catalog"
import type { PlayId } from "../../src/core/play/play"
import type { PlaySummary } from "../../src/core/report/plays"
import { groupName } from "../../src/ui/wording/breakdown"
import { playTitle } from "../../src/ui/wording/plays"

const PLAY: PlaySummary = { id: "one" as PlayId, date: "2026-10-21" as IsoDate, description: "ホシゾラ梅田店", parlorId: undefined, gameKind: "pachinko", machine: undefined, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: undefined , inferredValue: undefined}

const NAMES = machineNamesOf([
  { name: "e風の剣豪", modelName: "e風の剣豪KZ" },
  { name: "P流星群", modelName: undefined },
])

describe("what a play is called in a list", () => {
  test("is its machine as the halls call it, though the book keeps the model name", () => {
    expect(playTitle({ ...PLAY, machine: "e風の剣豪KZ" }, NAMES)).toBe("e風の剣豪")
    expect(playTitle({ ...PLAY, machine: "P流星群" }, NAMES)).toBe("P流星群")
  })

  test("is its machine as the book says it where the catalog knows none under that name", () => {
    expect(playTitle({ ...PLAY, machine: "手で打った機種名" }, NAMES)).toBe("手で打った機種名")
    expect(playTitle({ ...PLAY, machine: "e風の剣豪KZ" }, machineNamesOf([]))).toBe("e風の剣豪KZ")
  })

  test("is a play typed in by hand where it names none, a parlor named or not", () => {
    expect(playTitle(PLAY, NAMES)).toBe("手入力した稼働")
    expect(playTitle({ ...PLAY, description: "" }, NAMES)).toBe("手入力した稼働")
  })

  test("is what another app called it where it was taken in from one", () => {
    expect(playTitle({ ...PLAY, description: "梅田 流星 12番台", importedFrom: "precord" }, NAMES)).toBe("梅田 流星 12番台")
    expect(playTitle({ ...PLAY, description: " ", importedFrom: "precord" }, NAMES)).toBe("手入力した稼働")
  })
})

describe("what a group of plays is called", () => {
  test("is its machine as the halls call it when plays are grouped by machine, and its key otherwise", () => {
    expect(groupName("machine", "e風の剣豪KZ", NAMES)).toBe("e風の剣豪")
    expect(groupName("machine", "手で打った機種名", NAMES)).toBe("手で打った機種名")
    expect(groupName("parlor", "e風の剣豪KZ", NAMES)).toBe("e風の剣豪KZ")
  })
})
