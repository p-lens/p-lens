import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayId } from "../../src/core/play/play"
import * as Pachinko from "../../src/core/pachinko"
import * as Pachislot from "../../src/core/pachislot"
import type { YenTally } from "../../src/core/tally/tally"
import { atToldOf, emptyYenTallyForm, medalTermsFormOf, pachislotToldOf, readMedalTerms, readWeighingTerms, termsTypedOf, withInferred, yenTallyFormOf, HOUR_CHOICES, hoursOfMinutes, MINUTE_CHOICES, minutesToldIn, readYenTallyForm, resultOfYenTally } from "../../src/ui/features/record-tally/yen-tally-form"
import { MALEHAN, dec } from "../support/values"

const ID = "new" as PlayId

describe("the tally form", () => {
  test("reads what went in, what came back and a theoretical value, with no parlor named", () => {
    const form = { ...emptyYenTallyForm("2026-10-04", {}), machine: "e風の剣豪", outlay: "12,000", takings: "３０００", theoreticalValue: "8000" }
    expect(readYenTallyForm(form, [MALEHAN], () => ID)).toEqual({
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
    const form = { ...emptyYenTallyForm("2026-10-04", {}), parlorKey: "listed:malehan-tokyokoukoku", machine: "流星", outlay: "0" }
    const read = readYenTallyForm(form, [MALEHAN], () => ID)
    expect(read.ok && [read.value.parlor, read.value.outlay, read.value.takings, read.value.theoreticalValue]).toEqual([MALEHAN, dec("0"), dec("0"), undefined])
  })

  test("comes to the takings less the outlay, and to nothing said while either does not read", () => {
    expect(resultOfYenTally({ outlay: "12,000", takings: "3000" })).toEqual(dec("-9000"))
    expect(resultOfYenTally({ outlay: "5000", takings: "" })).toEqual(dec("-5000"))
    expect(resultOfYenTally({ outlay: "", takings: "3000" })).toBeUndefined()
    expect(resultOfYenTally({ outlay: "5000", takings: "x" })).toBeUndefined()
  })

  test("needs an outlay, and reports every field it could not read", () => {
    const form = { ...emptyYenTallyForm("2026-13-01", {}), parlorKey: "listed:gone", takings: "x", theoreticalValue: "x" }
    expect(readYenTallyForm(form, [MALEHAN], () => ID)).toEqual({
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
    const form = { ...emptyYenTallyForm("2026-09-30", {}), outlay: "1000" }
    const read = readYenTallyForm(form, [MALEHAN], (date) => `play-on-${date}` as never)
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
    const form = { ...emptyYenTallyForm("2026-10-04", {}), gameKind: "slot" as const, hours: "3.5", outlay: "20,000", counterGames: "4,200", counterBonuses: { big: "１５", reg: "" } }
    expect(pachislotToldOf(form, ["big", "reg"])).toEqual({ games: 4200, bonuses: { big: 15, reg: 0 }, hours: 3.5, outlay: 20000 })
    expect(pachislotToldOf({ ...form, counterGames: "" }, ["big", "reg"])).toBeUndefined()
    expect(pachislotToldOf({ ...form, hours: "" }, ["big", "reg"])).toBeUndefined()
    expect(pachislotToldOf({ ...form, counterBonuses: { big: "1.5" } }, ["big", "reg"])).toBeUndefined()
    expect(form.medalTerms).toEqual({ rentedPerThousand: "46", exchangedPerHundred: "5.2" })
    expect(readMedalTerms(form.medalTerms)).toEqual({ rentedPerThousand: 46, exchangedPerHundred: 5.2 })
    expect(readMedalTerms({ rentedPerThousand: "46.5", exchangedPerHundred: "5.2" })).toBeUndefined()
  })

  test("tells an AT machine's setting level its history: every AT typed, its CZs missed where counted, and the games since sitting and since the last AT", () => {
    const form = { ...emptyYenTallyForm("2026-10-04", {}), gameKind: "slot" as const, outlay: "15,000" }
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
  test("reads a pachinko play's terms as typed: whole balls rented, an exchange to two places, each more than none", () => {
    expect(readWeighingTerms({ rentedPerThousand: "250", exchangedPerHundred: "28" })).toEqual({ rentedPerThousand: 250, exchangedPerHundred: 28 })
    expect(readWeighingTerms({ rentedPerThousand: "１,０００", exchangedPerHundred: "27.5" })).toEqual({ rentedPerThousand: 1000, exchangedPerHundred: 27.5 })
    expect(readWeighingTerms({ rentedPerThousand: "240", exchangedPerHundred: "27.75" })).toEqual({ rentedPerThousand: 240, exchangedPerHundred: 27.75 })
    expect(readWeighingTerms({ rentedPerThousand: "250.5", exchangedPerHundred: "28" })).toBeUndefined()
    expect(readWeighingTerms({ rentedPerThousand: "0", exchangedPerHundred: "28" })).toBeUndefined()
    expect(readWeighingTerms({ rentedPerThousand: "250", exchangedPerHundred: "0" })).toBeUndefined()
    expect(readWeighingTerms({ rentedPerThousand: "250", exchangedPerHundred: "27.125" })).toBeUndefined()
    expect(readWeighingTerms({ rentedPerThousand: "", exchangedPerHundred: "28" })).toBeUndefined()
    expect(readWeighingTerms({ rentedPerThousand: "250", exchangedPerHundred: "-28" })).toBeUndefined()
  })

  test("opens on the terms the book keeps for each game, else the usual ones, and says those of its own game", () => {
    const usual = emptyYenTallyForm("2026-10-04", {})
    expect([usual.weighingTerms, usual.medalTerms]).toEqual([{ rentedPerThousand: "250", exchangedPerHundred: "28" }, { rentedPerThousand: "46", exchangedPerHundred: "5.2" }])
    const kept = emptyYenTallyForm("2026-10-04", { pachinko: { rentedPerThousand: 240, exchangedPerHundred: 27.5 }, slot: { rentedPerThousand: 47, exchangedPerHundred: 5.6 } })
    expect([kept.weighingTerms, kept.medalTerms]).toEqual([{ rentedPerThousand: "240", exchangedPerHundred: "27.5" }, { rentedPerThousand: "47", exchangedPerHundred: "5.6" }])
    expect(termsTypedOf(kept)).toEqual({ rentedPerThousand: 240, exchangedPerHundred: 27.5 })
    expect(termsTypedOf({ ...kept, gameKind: "slot" })).toEqual({ rentedPerThousand: 47, exchangedPerHundred: 5.6 })
    expect(termsTypedOf({ ...kept, weighingTerms: { rentedPerThousand: "x", exchangedPerHundred: "28" } })).toBeUndefined()
  })

  test("set right, opens on the terms a tally was weighed on, else those the book keeps", () => {
    const tally: YenTally = { id: "p" as PlayId, date: "2026-10-04" as IsoDate, parlor: undefined, gameKind: "pachinko", machine: "流星", cabinetNumber: undefined, outlay: dec("10000"), takings: dec("0"), settlement: undefined, theoreticalValue: undefined, told: { hours: dec("3"), jackpots: undefined, inferred: undefined } }
    const kept = { pachinko: { rentedPerThousand: 1000, exchangedPerHundred: 112 } }
    expect(yenTallyFormOf(tally, kept).weighingTerms).toEqual({ rentedPerThousand: "1000", exchangedPerHundred: "112" })
    const weighed = withInferred(tally, Pachinko.inferredWorthOf({ spinPerformance: 16, border: 20, theoreticalValue: -1000 }, "f", { rentedPerThousand: 240, exchangedPerHundred: 27.5 }))
    expect(yenTallyFormOf(weighed, kept).weighingTerms).toEqual({ rentedPerThousand: "240", exchangedPerHundred: "27.5" })
    const slot = withInferred({ ...tally, gameKind: "slot" }, Pachislot.inferredWorthOf("f", -1000, { rentedPerThousand: 47, exchangedPerHundred: 5.6 }))
    expect(yenTallyFormOf(slot, kept).medalTerms).toEqual({ rentedPerThousand: "47", exchangedPerHundred: "5.6" })
    expect(yenTallyFormOf({ ...tally, gameKind: "slot" }, {}).medalTerms).toEqual({ rentedPerThousand: "46", exchangedPerHundred: "5.2" })
    expect(medalTermsFormOf({ rentedPerThousand: 46, exchangedPerHundred: 5.15 })).toEqual({ rentedPerThousand: "46", exchangedPerHundred: "5.15" })
  })
})
