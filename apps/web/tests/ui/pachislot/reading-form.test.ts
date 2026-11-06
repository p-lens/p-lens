import { describe, expect, test } from "bun:test"

import { atReadingFrom, readAtReadingForm } from "../../../src/ui/features/pachislot/live/at-reading-form"
import { readingFrom, readReadingForm } from "../../../src/ui/features/pachislot/live/reading-form"

describe("a pachislot reading typed onto where the play stands", () => {
  const standing = { total: 2650, bonuses: { big: 8, reg: 5 }, outlay: 3000, replay: 120, held: undefined }

  test("opens on the day's games, each bonus and the outlay, and reads back as the play stands", () => {
    const form = readingFrom(standing, ["big", "reg", "extra"])
    expect(form).toEqual({ total: "2650", bonuses: { big: "8", reg: "5", extra: "0" }, outlay: "3000", replay: "120", held: "", heldCarried: false, handed: "", handing: "given" })
    expect(readReadingForm(form, standing.bonuses, ["big", "reg", "extra"])).toEqual({ ok: true, value: { total: 2650, bonuses: { big: 8, reg: 5, extra: 0 }, outlay: 3000, replay: 120, held: undefined, handed: 0 } })
  })

  test("leaves the outlay and the medals drawn from savings empty where none was given", () => {
    expect(readingFrom({ ...standing, outlay: undefined, replay: undefined }, [])).toMatchObject({ outlay: "", replay: "" })
  })

  test("opens on the medals in hand as last counted, carried over and not read again until typed over", () => {
    const carried = readingFrom({ ...standing, held: 640 }, ["big"])
    expect(carried).toMatchObject({ held: "640", heldCarried: true })
    expect(readReadingForm(carried, standing.bonuses, ["big"])).toMatchObject({ ok: true, value: { held: undefined, handed: 0 } })
    expect(readReadingForm({ ...carried, held: "700", heldCarried: false, handed: "", handing: "received" }, standing.bonuses, ["big"])).toMatchObject({ ok: true, value: { held: 700 } })
    const at = atReadingFrom({ sinceAt: 10, outlay: undefined, replay: undefined, held: 300 })
    expect(at).toMatchObject({ held: "300", heldCarried: true })
    expect(readAtReadingForm(at)).toMatchObject({ ok: true, value: { held: undefined, handed: 0 } })
  })

  test("reads the medals in hand where they were counted, and refuses what is not a count", () => {
    const form = { ...readingFrom(standing, ["big"]), held: "1,250" }
    expect(readReadingForm(form, standing.bonuses, ["big"])).toMatchObject({ ok: true, value: { held: 1250 } })
    expect(readReadingForm({ ...form, held: "千" }, standing.bonuses, ["big"])).toEqual({ ok: false, error: [{ field: "held", reason: "not-a-count" }] })
    expect(readAtReadingForm({ ...atReadingFrom({ sinceAt: 10, outlay: undefined, replay: undefined, held: undefined }), held: "820" })).toMatchObject({ ok: true, value: { held: 820 } })
  })
})

describe("medals handed to or by other players, typed on a pachislot reading", () => {
  test("are read signed by the way they went, away unless turned, none where nothing is typed, and refused where not a count", () => {
    const standing = { total: 2650, bonuses: {}, outlay: undefined, replay: undefined, held: undefined }
    const form = readingFrom(standing, [])
    expect(readReadingForm({ ...form, handed: "120", handing: "given" }, {}, [])).toMatchObject({ ok: true, value: { handed: -120 } })
    expect(readReadingForm({ ...form, handed: "120" }, {}, [])).toMatchObject({ ok: true, value: { handed: -120 } })
    expect(readReadingForm({ ...form, handed: "120", handing: "received" }, {}, [])).toMatchObject({ ok: true, value: { handed: 120 } })
    expect(readReadingForm(form, {}, [])).toMatchObject({ ok: true, value: { handed: 0 } })
    expect(readReadingForm({ ...form, handed: "百" }, {}, [])).toEqual({ ok: false, error: [{ field: "handed", reason: "not-a-count" }] })
    expect(readReadingForm({ ...form, held: "1200", handed: "500", handing: "given" }, {}, [])).toMatchObject({ ok: true, value: { held: 700, handed: -500 } })
    expect(readReadingForm({ ...form, held: "1200", handed: "300", handing: "received" }, {}, [])).toMatchObject({ ok: true, value: { held: 1500, handed: 300 } })
    const at = atReadingFrom({ sinceAt: 10, outlay: undefined, replay: undefined, held: undefined })
    expect(readAtReadingForm({ ...at, handed: "60", handing: "given" })).toMatchObject({ ok: true, value: { handed: -60 } })
    expect(readAtReadingForm({ ...at, handed: "x" })).toEqual({ ok: false, error: [{ field: "handed", reason: "not-a-count" }] })
    expect(readAtReadingForm({ ...at, held: "800", heldCarried: false, handed: "300", handing: "given" })).toMatchObject({ ok: true, value: { held: 500, handed: -300 } })
  })
})

describe("an AT machine's reading typed onto where the play stands", () => {
  test("opens on the games since the last AT and the outlay, and reads back the same", () => {
    const form = atReadingFrom({ sinceAt: 412, outlay: 8000, replay: undefined, held: undefined })
    expect(form).toEqual({ sinceAt: "412", outlay: "8000", replay: "", held: "", heldCarried: false, handed: "", handing: "given" })
    expect(readAtReadingForm(form)).toEqual({ ok: true, value: { sinceAt: 412, outlay: 8000, replay: undefined, held: undefined, handed: 0 } })
    expect(atReadingFrom({ sinceAt: 0, outlay: undefined, replay: undefined, held: undefined })).toEqual({ sinceAt: "0", outlay: "", replay: "", held: "", heldCarried: false, handed: "", handing: "given" })
  })
})
