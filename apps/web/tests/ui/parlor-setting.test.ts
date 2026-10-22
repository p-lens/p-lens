import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { SharedParlorId } from "../../src/core/parlor/shared"
import { type ParlorSetting, recalledParlorSetting, writtenParlorSetting } from "../../src/ui/features/live/parlor-setting"

const DAY = "2026-10-07" as IsoDate

const SETTING: ParlorSetting = {
  parlor: { type: "listed", id: "p1" as SharedParlorId },
  terms: {
    pachinko: { rentalTokens: "250", exchange: "28.0", replayPaidOut: "125", replayDeducted: "133" },
    pachislot: { rentalTokens: "", exchange: "", replayPaidOut: "25", replayDeducted: "25" },
  },
}

describe("a parlor setting kept for its business day", () => {
  test("is recalled as it was written, on the day it was made", () => {
    expect(recalledParlorSetting(writtenParlorSetting(DAY, SETTING), DAY)).toEqual(SETTING)
  })

  test("is not the next day's", () => {
    expect(recalledParlorSetting(writtenParlorSetting(DAY, SETTING), "2026-10-08" as IsoDate)).toBeUndefined()
  })

  test("reads one kept while presses were kept in it, leaving them", () => {
    expect(recalledParlorSetting(JSON.stringify({ day: DAY, parlor: SETTING.parlor, terms: SETTING.terms, presses: { "1000/250": { rental: 500 } } }), DAY)).toEqual(SETTING)
  })

  test("is nothing where none was kept, or what was kept does not read as one", () => {
    expect(recalledParlorSetting(undefined, DAY)).toBeUndefined()
    expect(recalledParlorSetting("{", DAY)).toBeUndefined()
    expect(recalledParlorSetting(JSON.stringify({ day: DAY, parlor: { type: "listed" }, terms: SETTING.terms }), DAY)).toBeUndefined()
    expect(recalledParlorSetting(JSON.stringify({ day: DAY, parlor: SETTING.parlor, terms: { pachinko: SETTING.terms.pachinko } }), DAY)).toBeUndefined()
  })
})
