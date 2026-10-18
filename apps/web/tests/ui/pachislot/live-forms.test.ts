import { describe, expect, test } from "bun:test"

import { readAtReadingForm } from "../../../src/ui/features/pachislot/live/at-reading-form"
import { atResultLine, awaitsAtResult, EMPTY_AT_RESULT, endingOfValue, endingValueOf, readAtResultForm } from "../../../src/ui/features/pachislot/live/at-result-form"
import { readReadingForm } from "../../../src/ui/features/pachislot/live/reading-form"
import { readSeat, seatLineOf } from "../../../src/ui/features/pachislot/start/seat-form"

describe("the seat's data counter as typed", () => {
  test("empty is a fresh cabinet: no games, no bonuses", () => {
    expect(readSeat({ total: "", bonuses: {}, sinceBonus: "", sinceCz: "", misses: "", held: "", sinceAtAcrossBonuses: "", mode: "" }, ["big", "reg"])).toEqual({
      ok: true,
      value: { total: 0, sinceBonus: 0, sinceCz: undefined, misses: 0, held: undefined, sinceAtAcrossBonuses: undefined, mode: undefined, bonuses: { big: 0, reg: 0 } },
    })
  })

  test("reads the day's games and each bonus, commas and wide digits and all", () => {
    expect(readSeat({ total: "２,４００", bonuses: { big: "9", reg: "7" }, sinceBonus: "120", sinceCz: "", misses: "", held: "", sinceAtAcrossBonuses: "", mode: "" }, ["big", "reg"])).toEqual({
      ok: true,
      value: { total: 2400, sinceBonus: 120, sinceCz: undefined, misses: 0, held: undefined, sinceAtAcrossBonuses: undefined, mode: undefined, bonuses: { big: 9, reg: 7 } },
    })
  })

  test("a bonus left empty on a counter that has played games is asked for, and a count that is not one is refused", () => {
    expect(readSeat({ total: "2400", bonuses: { big: "9" }, sinceBonus: "x", sinceCz: "", misses: "", held: "", sinceAtAcrossBonuses: "", mode: "" }, ["big", "reg"])).toEqual({
      ok: false,
      error: [
        { field: "sinceBonus", reason: "not-a-count" },
        { field: { bonus: "reg" }, reason: "required" },
      ],
    })
  })

  test("on an AT machine a CZ brings, the games since the CZ are none when empty, and the misses a count", () => {
    expect(readSeat({ total: "", bonuses: {}, sinceBonus: "300", sinceCz: "４０", misses: "2", held: "", sinceAtAcrossBonuses: "", mode: "" }, [])).toEqual({
      ok: true,
      value: { total: 0, sinceBonus: 300, sinceCz: 40, misses: 2, held: undefined, sinceAtAcrossBonuses: undefined, mode: undefined, bonuses: {} },
    })
    expect(readSeat({ total: "", bonuses: {}, sinceBonus: "300", sinceCz: "x", misses: "-1", held: "", sinceAtAcrossBonuses: "", mode: "" }, [])).toEqual({
      ok: false,
      error: [
        { field: "sinceCz", reason: "not-a-count" },
        { field: "misses", reason: "not-a-count" },
      ],
    })
  })

  test("the mode play is in is none when unknown, and written on the seat's line where said", () => {
    const read = readSeat({ total: "", bonuses: {}, sinceBonus: "250", sinceCz: "", misses: "", held: "", sinceAtAcrossBonuses: "", mode: "mode-299" }, [])
    expect(read.ok && read.value.mode).toBe("mode-299")
    expect(read.ok ? seatLineOf(true, read.value, false, "2026-10-18T12:00:00.000Z").counter : undefined).toEqual({ spins: 250, mode: "mode-299" })
    const unknown = readSeat({ total: "", bonuses: {}, sinceBonus: "250", sinceCz: "", misses: "", held: "", sinceAtAcrossBonuses: "", mode: "" }, [])
    expect(unknown.ok && unknown.value.mode).toBeUndefined()
  })

  test("the games since the AT itself across bonuses are none when empty, and written on the seat's line where given", () => {
    const read = readSeat({ total: "", bonuses: {}, sinceBonus: "120", sinceCz: "", misses: "", held: "", sinceAtAcrossBonuses: "１,０５０", mode: "" }, [])
    expect(read).toEqual({ ok: true, value: { total: 0, sinceBonus: 120, sinceCz: undefined, misses: 0, held: undefined, sinceAtAcrossBonuses: 1050, mode: undefined, bonuses: {} } })
    expect(read.ok ? seatLineOf(true, read.value, false, "2026-10-05T12:00:00.000Z").counter : undefined).toEqual({ spins: 120, sinceAtAcrossBonuses: 1050 })
    expect(readSeat({ total: "", bonuses: {}, sinceBonus: "120", sinceCz: "", misses: "", held: "", sinceAtAcrossBonuses: "x", mode: "" }, [])).toEqual({
      ok: false,
      error: [{ field: "sinceAtAcrossBonuses", reason: "not-a-count" }],
    })
    expect(readSeat({ total: "", bonuses: {}, sinceBonus: "120", sinceCz: "", misses: "", held: "", sinceAtAcrossBonuses: "80", mode: "" }, [])).toEqual({
      ok: false,
      error: [{ field: "sinceAtAcrossBonuses", reason: "below-since-bonus" }],
    })
  })
})

describe("an AT machine's counter reading as typed", () => {
  test("needs the games since the last AT; an outlay left empty was not read", () => {
    expect(readAtReadingForm({ sinceAt: "１,２００", outlay: "", replay: "" })).toEqual({ ok: true, value: { sinceAt: 1200, outlay: undefined, replay: undefined } })
    expect(readAtReadingForm({ sinceAt: "", outlay: "3千", replay: "" })).toEqual({
      ok: false,
      error: [
        { field: "sinceAt", reason: "required" },
        { field: "outlay", reason: "not-a-count" },
      ],
    })
  })
})

describe("a pachislot counter reading as typed", () => {
  test("needs the day's games; a bonus left empty is as the log knows it, an outlay left empty was not read", () => {
    expect(readReadingForm({ total: "2650", bonuses: { big: "10" }, outlay: "", replay: "" }, { big: 9, reg: 7 }, ["big", "reg"])).toEqual({
      ok: true,
      value: { total: 2650, outlay: undefined, replay: undefined, bonuses: { big: 10, reg: 7 } },
    })
  })

  test("says every field it cannot read", () => {
    expect(readReadingForm({ total: "", bonuses: { reg: "1.5" }, outlay: "千円", replay: "" }, {}, ["big", "reg"])).toEqual({
      ok: false,
      error: [
        { field: "total", reason: "required" },
        { field: "outlay", reason: "not-a-count" },
        { field: { bonus: "reg" }, reason: "not-a-count" },
      ],
    })
  })
})

describe("an AT's result as typed when it ends", () => {
  test("only what was said is kept, and a count that is not one is refused", () => {
    expect(readAtResultForm(EMPTY_AT_RESULT)).toEqual({ ok: true, value: { kind: "at-ended" } })
    expect(readAtResultForm({ completion: "short", sets: "４", medals: "1,200", ending: undefined })).toEqual({
      ok: true,
      value: { kind: "at-ended", completed: false, sets: 4, medals: 1200 },
    })
    expect(readAtResultForm({ completion: "completed", sets: "x", medals: "2400枚", ending: undefined })).toEqual({
      ok: false,
      error: [
        { field: "sets", reason: "not-a-count" },
        { field: "medals", reason: "not-a-count" },
      ],
    })
  })

  test("how it ended is kept by the ending's id where said, the toggle telling an ending from none", () => {
    expect(readAtResultForm({ ...EMPTY_AT_RESULT, ending: "through" })).toEqual({ ok: true, value: { kind: "at-ended", ending: "through" } })
    expect(endingOfValue(endingValueOf("through"))).toBe("through")
    expect(endingOfValue(endingValueOf(undefined))).toBeUndefined()
    expect(endingOfValue(endingValueOf("unsaid"))).toBe("unsaid")
  })

  test("is written on the games the AT was won on, and only after one", () => {
    const at = "2026-10-05T12:00:00.000Z"
    const won = [{ spins: 0 }, { spins: 120, event: { kind: "jackpot" as const } }]
    expect(awaitsAtResult(won)).toBe(true)
    expect(atResultLine(won, { kind: "at-ended", completed: true }, at)).toEqual({
      ok: true,
      value: [{ spins: 120, at, event: { kind: "at-ended", completed: true } }],
    })
    expect(awaitsAtResult([...won, { spins: 120, event: { kind: "at-ended" as const } }])).toBe(false)
    expect(atResultLine([{ spins: 0 }], { kind: "at-ended" }, at)).toEqual({ ok: false, error: "no-at" })
  })
})
