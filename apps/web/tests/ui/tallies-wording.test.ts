import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { machineNamesOf } from "../../src/core/catalog/catalog"
import type { PlayId } from "../../src/core/play/play"
import type { TallySummary } from "../../src/core/report/tallies"
import { groupName } from "../../src/ui/wording/breakdown"
import { tallyTitle } from "../../src/ui/wording/tallies"

const PLAY: TallySummary = { id: "one" as PlayId, date: "2026-10-21" as IsoDate, description: "ホシゾラ梅田店", parlorId: undefined, gameKind: "pachinko", machine: undefined, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: undefined , inferredValue: undefined}

const NAMES = machineNamesOf([
  { name: "e風の剣豪", modelName: "e風の剣豪KZ" },
  { name: "P流星群", modelName: undefined },
])

describe("what a tally is called in a list", () => {
  test("is its machine as the halls call it, though the book keeps the model name", () => {
    expect(tallyTitle({ ...PLAY, machine: "e風の剣豪KZ" }, NAMES)).toBe("e風の剣豪")
    expect(tallyTitle({ ...PLAY, machine: "P流星群" }, NAMES)).toBe("P流星群")
  })

  test("is its machine as the book says it where the catalog knows none under that name", () => {
    expect(tallyTitle({ ...PLAY, machine: "手で打った機種名" }, NAMES)).toBe("手で打った機種名")
    expect(tallyTitle({ ...PLAY, machine: "e風の剣豪KZ" }, machineNamesOf([]))).toBe("e風の剣豪KZ")
  })

  test("is a tally typed in by hand where it names none, a parlor named or not", () => {
    expect(tallyTitle(PLAY, NAMES)).toBe("手入力した収支")
    expect(tallyTitle({ ...PLAY, description: "" }, NAMES)).toBe("手入力した収支")
  })

  test("is what another app called it where it was taken in from one", () => {
    expect(tallyTitle({ ...PLAY, description: "梅田 流星 12番台", importedFrom: "precord" }, NAMES)).toBe("梅田 流星 12番台")
    expect(tallyTitle({ ...PLAY, description: " ", importedFrom: "precord" }, NAMES)).toBe("手入力した収支")
  })
})

describe("what a group of tallies is called", () => {
  test("is its machine as the halls call it when tallies are grouped by machine, and its key otherwise", () => {
    expect(groupName("machine", "e風の剣豪KZ", NAMES)).toBe("e風の剣豪")
    expect(groupName("machine", "手で打った機種名", NAMES)).toBe("手で打った機種名")
    expect(groupName("parlor", "e風の剣豪KZ", NAMES)).toBe("e風の剣豪KZ")
  })
})
