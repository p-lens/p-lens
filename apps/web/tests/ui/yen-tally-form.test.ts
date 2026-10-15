import { describe, expect, test } from "bun:test"

import type { PlayId } from "../../src/core/play/play"
import { atToldOf, emptyYenTallyForm, pachislotToldOf, readMedalTerms, HOUR_CHOICES, hoursOfMinutes, MINUTE_CHOICES, minutesToldIn, readYenTallyForm, resultOfYenTally } from "../../src/ui/features/record-tally/yen-tally-form"
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
        settlement: undefined,
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

  test("tells a pachislot play's setting level what its data counter showed, its hours and its cash, and only once the games, the hours and every bonus read", () => {
    const form = { ...emptyYenTallyForm("2026-10-04"), gameKind: "slot" as const, hours: "3.5", outlay: "20,000", counterGames: "4,200", counterBonuses: { big: "１５", reg: "" } }
    expect(pachislotToldOf(form, ["big", "reg"])).toEqual({ games: 4200, bonuses: { big: 15, reg: 0 }, hours: 3.5, outlay: 20000 })
    expect(pachislotToldOf({ ...form, counterGames: "" }, ["big", "reg"])).toBeUndefined()
    expect(pachislotToldOf({ ...form, hours: "" }, ["big", "reg"])).toBeUndefined()
    expect(pachislotToldOf({ ...form, counterBonuses: { big: "1.5" } }, ["big", "reg"])).toBeUndefined()
    expect(form.medalTerms).toEqual({ rentedPerThousand: "46", exchangedPerHundred: "5.10" })
    expect(readMedalTerms(form.medalTerms)).toEqual({ rentedPerThousand: 46, exchangedPerHundred: 5.1 })
    expect(readMedalTerms({ rentedPerThousand: "46.5", exchangedPerHundred: "5.2" })).toBeUndefined()
  })

  test("tells an AT machine's setting level its history: every AT typed, its CZs missed where counted, and the games since sitting and since the last AT", () => {
    const form = { ...emptyYenTallyForm("2026-10-04"), gameKind: "slot" as const, outlay: "15,000" }
    const history = (atHistory: typeof form.atHistory) => atToldOf({ ...form, atHistory })
    expect(history({ sinceAt: "120", afterReset: false, ats: [{ games: "300", misses: "" }, { games: "", misses: "" }, { games: "88", misses: "２" }], since: "40" })).toEqual({
      sinceAt: 120,
      afterReset: false,
      ats: [{ games: 300, misses: undefined }, { games: 88, misses: 2 }],
      since: 40,
      outlay: 15000,
    })
    expect(history({ sinceAt: "", afterReset: true, ats: [], since: "" })).toBeUndefined()
    expect(history({ sinceAt: "", afterReset: true, ats: [{ games: "0", misses: "" }], since: "" })).toBeUndefined()
    expect(history({ sinceAt: "", afterReset: true, ats: [{ games: "300", misses: "x" }], since: "" })).toBeUndefined()
    expect(history({ sinceAt: "", afterReset: true, ats: [], since: "250" })?.since).toBe(250)
  })
})
