import { describe, expect, test } from "bun:test"

import { atReadingFrom, readAtReadingForm } from "../../../src/ui/features/pachislot/live/at-reading-form"
import { readingFrom, readReadingForm } from "../../../src/ui/features/pachislot/live/reading-form"

describe("a pachislot reading typed onto where the play stands", () => {
  const standing = { total: 2650, bonuses: { big: 8, reg: 5 }, outlay: 3000, replay: 120, held: undefined }

  test("opens on the day's games, each bonus and the outlay, and reads back as the play stands", () => {
    const form = readingFrom(standing, ["big", "reg", "extra"])
    expect(form).toEqual({ total: "2650", bonuses: { big: "8", reg: "5", extra: "0" }, outlay: "3000", replay: "120", held: "", heldCarried: false })
    expect(readReadingForm(form, standing.bonuses, ["big", "reg", "extra"])).toEqual({ ok: true, value: { total: 2650, bonuses: { big: 8, reg: 5, extra: 0 }, outlay: 3000, replay: 120, held: undefined } })
  })

  test("leaves the outlay and the medals drawn from savings empty where none was given", () => {
    expect(readingFrom({ ...standing, outlay: undefined, replay: undefined }, [])).toMatchObject({ outlay: "", replay: "" })
  })

  test("opens on the medals in hand as last counted, carried over and not read again until typed over", () => {
    const carried = readingFrom({ ...standing, held: 640 }, ["big"])
    expect(carried).toMatchObject({ held: "640", heldCarried: true })
    expect(readReadingForm(carried, standing.bonuses, ["big"])).toMatchObject({ ok: true, value: { held: undefined } })
    expect(readReadingForm({ ...carried, held: "700", heldCarried: false }, standing.bonuses, ["big"])).toMatchObject({ ok: true, value: { held: 700 } })
    const at = atReadingFrom({ sinceAt: 10, outlay: undefined, replay: undefined, held: 300 })
    expect(at).toMatchObject({ held: "300", heldCarried: true })
    expect(readAtReadingForm(at)).toMatchObject({ ok: true, value: { held: undefined } })
  })

  test("reads the medals in hand where they were counted, and refuses what is not a count", () => {
    const form = { ...readingFrom(standing, ["big"]), held: "1,250" }
    expect(readReadingForm(form, standing.bonuses, ["big"])).toMatchObject({ ok: true, value: { held: 1250 } })
    expect(readReadingForm({ ...form, held: "千" }, standing.bonuses, ["big"])).toEqual({ ok: false, error: [{ field: "held", reason: "not-a-count" }] })
    expect(readAtReadingForm({ ...atReadingFrom({ sinceAt: 10, outlay: undefined, replay: undefined, held: undefined }), held: "820" })).toMatchObject({ ok: true, value: { held: 820 } })
  })
})

describe("an AT machine's reading typed onto where the play stands", () => {
  test("opens on the games since the last AT and the outlay, and reads back the same", () => {
    const form = atReadingFrom({ sinceAt: 412, outlay: 8000, replay: undefined, held: undefined })
    expect(form).toEqual({ sinceAt: "412", outlay: "8000", replay: "", held: "", heldCarried: false })
    expect(readAtReadingForm(form)).toEqual({ ok: true, value: { sinceAt: 412, outlay: 8000, replay: undefined, held: undefined } })
    expect(atReadingFrom({ sinceAt: 0, outlay: undefined, replay: undefined, held: undefined })).toEqual({ sinceAt: "0", outlay: "", replay: "", held: "", heldCarried: false })
  })
})
