import { describe, expect, test } from "bun:test"

import { atReadingFrom, readAtReadingForm } from "../../../src/ui/features/pachislot/live/at-reading-form"
import { readingFrom, readReadingForm } from "../../../src/ui/features/pachislot/live/reading-form"

describe("a pachislot reading typed onto where the play stands", () => {
  const standing = { total: 2650, bonuses: { big: 8, reg: 5 }, outlay: 3000, replay: 120 }

  test("opens on the day's games, each bonus and the outlay, and reads back as the play stands", () => {
    const form = readingFrom(standing, ["big", "reg", "extra"])
    expect(form).toEqual({ total: "2650", bonuses: { big: "8", reg: "5", extra: "0" }, outlay: "3000", replay: "120", held: "" })
    expect(readReadingForm(form, standing.bonuses, ["big", "reg", "extra"])).toEqual({ ok: true, value: { total: 2650, bonuses: { big: 8, reg: 5, extra: 0 }, outlay: 3000, replay: 120, held: undefined } })
  })

  test("leaves the outlay and the medals drawn from savings empty where none was given", () => {
    expect(readingFrom({ ...standing, outlay: undefined, replay: undefined }, [])).toMatchObject({ outlay: "", replay: "" })
  })

  test("reads the medals in hand where they were counted, and refuses what is not a count", () => {
    const form = { ...readingFrom(standing, ["big"]), held: "1,250" }
    expect(readReadingForm(form, standing.bonuses, ["big"])).toMatchObject({ ok: true, value: { held: 1250 } })
    expect(readReadingForm({ ...form, held: "千" }, standing.bonuses, ["big"])).toEqual({ ok: false, error: [{ field: "held", reason: "not-a-count" }] })
    expect(readAtReadingForm({ ...atReadingFrom({ sinceAt: 10, outlay: undefined, replay: undefined }), held: "820" })).toMatchObject({ ok: true, value: { held: 820 } })
  })
})

describe("an AT machine's reading typed onto where the play stands", () => {
  test("opens on the games since the last AT and the outlay, and reads back the same", () => {
    const form = atReadingFrom({ sinceAt: 412, outlay: 8000, replay: undefined })
    expect(form).toEqual({ sinceAt: "412", outlay: "8000", replay: "", held: "" })
    expect(readAtReadingForm(form)).toEqual({ ok: true, value: { sinceAt: 412, outlay: 8000, replay: undefined, held: undefined } })
    expect(atReadingFrom({ sinceAt: 0, outlay: undefined, replay: undefined })).toEqual({ sinceAt: "0", outlay: "", replay: "", held: "" })
  })
})
