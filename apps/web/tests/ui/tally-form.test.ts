import { describe, expect, test } from "bun:test"

import type { PlayId } from "../../src/core/play/play"
import { emptyTallyForm, readTallyForm } from "../../src/ui/features/record-play/tally-form"
import { UMEDA, dec } from "../support/values"

const ID = "new" as PlayId

describe("the tally form", () => {
  test("reads a loss and a theoretical value, with no parlor named", () => {
    const form = { ...emptyTallyForm("2026-10-04"), machine: "e風の剣豪", result: "-12,000", theoreticalValue: "8000" }
    expect(readTallyForm(form, [UMEDA], () => ID)).toEqual({
      ok: true,
      value: {
        id: ID,
        date: "2026-10-04" as never,
        parlor: undefined,
        gameKind: "pachinko",
        machine: "e風の剣豪",
        cabinetNumber: undefined,
        result: dec("-12000"),
        theoreticalValue: dec("8000"),
      },
    })
  })

  test("leaves the theoretical value out when empty, and names the parlor chosen", () => {
    const form = { ...emptyTallyForm("2026-10-04"), parlorKey: "listed:hoshizora-umeda", machine: "流星", result: "0" }
    const read = readTallyForm(form, [UMEDA], () => ID)
    expect(read.ok && [read.value.parlor, read.value.result, read.value.theoreticalValue]).toEqual([UMEDA, dec("0"), undefined])
  })

  test("needs a result, and reports every field it could not read", () => {
    const form = { ...emptyTallyForm("2026-13-01"), parlorKey: "listed:gone", theoreticalValue: "x" }
    expect(readTallyForm(form, [UMEDA], () => ID)).toEqual({
      ok: false,
      error: [
        { field: "date", reason: "not-a-date" },
        { field: "parlor", reason: "required" },
        { field: "result", reason: "required" },
        { field: "theoretical-value", reason: "not-a-number" },
      ],
    })
  })

  test("names the play for the day it was played, once that day is read", () => {
    const form = { ...emptyTallyForm("2026-09-30"), result: "1000" }
    const read = readTallyForm(form, [UMEDA], (date) => `play-on-${date}` as never)
    expect(read.ok && read.value.id).toBe("play-on-2026-09-30" as never)
  })
})
