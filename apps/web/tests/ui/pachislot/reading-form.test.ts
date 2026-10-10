import { describe, expect, test } from "bun:test"

import { atReadingFrom, readAtReadingForm } from "../../../src/ui/features/pachislot/live/at-reading-form"
import { readingFrom, readReadingForm } from "../../../src/ui/features/pachislot/live/reading-form"

describe("a pachislot reading typed onto where the play stands", () => {
  const standing = { total: 2650, bonuses: { big: 8, reg: 5 }, outlay: 3000 }

  test("opens on the day's games, each bonus and the outlay, and reads back as the play stands", () => {
    const form = readingFrom(standing, ["big", "reg", "extra"])
    expect(form).toEqual({ total: "2650", bonuses: { big: "8", reg: "5", extra: "0" }, outlay: "3000" })
    expect(readReadingForm(form, standing.bonuses, ["big", "reg", "extra"])).toEqual({ ok: true, value: { total: 2650, bonuses: { big: 8, reg: 5, extra: 0 }, outlay: 3000 } })
  })

  test("leaves the outlay empty where none was given", () => {
    expect(readingFrom({ ...standing, outlay: undefined }, []).outlay).toBe("")
  })
})

describe("an AT machine's reading typed onto where the play stands", () => {
  test("opens on the games since the last AT and the outlay, and reads back the same", () => {
    const form = atReadingFrom({ sinceAt: 412, outlay: 8000 })
    expect(form).toEqual({ sinceAt: "412", outlay: "8000" })
    expect(readAtReadingForm(form)).toEqual({ ok: true, value: { sinceAt: 412, outlay: 8000 } })
    expect(atReadingFrom({ sinceAt: 0, outlay: undefined })).toEqual({ sinceAt: "0", outlay: "" })
  })
})
