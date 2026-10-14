import { describe, expect, test } from "bun:test"

import type { PlayId } from "../../src/core/play/play"
import { emptyYenTallyForm, HOUR_CHOICES, hoursOfMinutes, MINUTE_CHOICES, minutesToldIn, readYenTallyForm, resultOfYenTally } from "../../src/ui/features/record-tally/yen-tally-form"
import { UMEDA, dec } from "../support/values"

const ID = "new" as PlayId

describe("the tally form", () => {
  test("reads what went in, what came back and a theoretical value, with no parlor named", () => {
    const form = { ...emptyYenTallyForm("2026-10-04"), machine: "e風の剣豪", outlay: "12,000", takings: "３０００", theoreticalValue: "8000" }
    expect(readYenTallyForm(form, [UMEDA], () => ID)).toEqual({
      ok: true,
      value: {
        id: ID,
        date: "2026-10-04" as never,
        parlor: undefined,
        gameKind: "pachinko",
        machine: "e風の剣豪",
        cabinetNumber: undefined,
        outlay: dec("12000"),
        takings: dec("3000"),
        theoreticalValue: dec("8000"), told: undefined,
      },
    })
  })

  test("leaves the theoretical value out when empty, takes nothing back where no takings are typed, and names the parlor chosen", () => {
    const form = { ...emptyYenTallyForm("2026-10-04"), parlorKey: "listed:hoshizora-umeda", machine: "流星", outlay: "0" }
    const read = readYenTallyForm(form, [UMEDA], () => ID)
    expect(read.ok && [read.value.parlor, read.value.outlay, read.value.takings, read.value.theoreticalValue]).toEqual([UMEDA, dec("0"), dec("0"), undefined])
  })

  test("comes to the takings less the outlay, and to nothing said while either does not read", () => {
    expect(resultOfYenTally({ outlay: "12,000", takings: "3000" })).toEqual(dec("-9000"))
    expect(resultOfYenTally({ outlay: "5000", takings: "" })).toEqual(dec("-5000"))
    expect(resultOfYenTally({ outlay: "", takings: "3000" })).toBeUndefined()
    expect(resultOfYenTally({ outlay: "5000", takings: "x" })).toBeUndefined()
  })

  test("needs an outlay, and reports every field it could not read", () => {
    const form = { ...emptyYenTallyForm("2026-13-01"), parlorKey: "listed:gone", takings: "x", theoreticalValue: "x" }
    expect(readYenTallyForm(form, [UMEDA], () => ID)).toEqual({
      ok: false,
      error: [
        { field: "date", reason: "not-a-date" },
        { field: "parlor", reason: "required" },
        { field: "outlay", reason: "required" },
        { field: "takings", reason: "not-a-number" },
        { field: "theoretical-value", reason: "not-a-number" },
      ],
    })
  })

  test("names the tally for the day its play was played, once that day is read", () => {
    const form = { ...emptyYenTallyForm("2026-09-30"), outlay: "1000" }
    const read = readYenTallyForm(form, [UMEDA], (date) => `play-on-${date}` as never)
    expect(read.ok && read.value.id).toBe("play-on-2026-09-30" as never)
  })

  test("holds a play's hours to the hundredth, as the hours and the minutes chosen five at a time come to, and reads them back as chosen", () => {
    expect([145, 5, 55, 60, 1440].map(hoursOfMinutes)).toEqual(["2.42", "0.08", "0.92", "1", "24"])
    expect([0, -5].map(hoursOfMinutes)).toEqual(["", ""])
    expect(["2.42", "0.08", "0.92", "1", "24", "4.25"].map((hours) => minutesToldIn({ hours }))).toEqual([145, 5, 55, 60, 1440, 255])
    expect(minutesToldIn({ hours: "" })).toBeUndefined()
    expect(HOUR_CHOICES.every((hours) => MINUTE_CHOICES.every((minutes) => (minutesToldIn({ hours: hoursOfMinutes(hours * 60 + minutes) }) ?? 0) === hours * 60 + minutes))).toBe(true)
    expect([HOUR_CHOICES.at(0), HOUR_CHOICES.at(-1), MINUTE_CHOICES.at(1), MINUTE_CHOICES.at(-1)]).toEqual([0, 24, 5, 55])
  })
})
