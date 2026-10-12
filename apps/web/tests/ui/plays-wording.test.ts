import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayId } from "../../src/core/play/play"
import type { PlaySummary } from "../../src/core/report/plays"
import { playTitle } from "../../src/ui/wording/plays"

const PLAY: PlaySummary = { id: "one" as PlayId, date: "2026-10-21" as IsoDate, description: "ホシゾラ梅田店", parlorId: undefined, gameKind: "pachinko", machine: undefined, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: undefined }

describe("what a play is called in a list", () => {
  test("is its machine where it names one", () => {
    expect(playTitle({ ...PLAY, machine: "e風の剣豪" })).toBe("e風の剣豪")
  })

  test("is the day it was typed in for where it names none, a parlor named or not", () => {
    expect(playTitle(PLAY)).toBe("2026年10月21日分の手入力した稼働")
    expect(playTitle({ ...PLAY, description: "" })).toBe("2026年10月21日分の手入力した稼働")
  })

  test("is what another app called it where it was taken in from one", () => {
    expect(playTitle({ ...PLAY, description: "梅田 流星 12番台", importedFrom: "precord" })).toBe("梅田 流星 12番台")
    expect(playTitle({ ...PLAY, description: " ", importedFrom: "precord" })).toBe("2026年10月21日分の手入力した稼働")
  })
})
