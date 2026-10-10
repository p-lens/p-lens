import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { SharedParlorId } from "../../src/core/parlor/shared"
import { type ParlorSetting, pressesAt, recalledParlorSetting, withPresses, writtenParlorSetting } from "../../src/ui/features/live/parlor-setting"

const DAY = "2026-10-07" as IsoDate

const SETTING: ParlorSetting = {
  parlor: { type: "listed", id: "p1" as SharedParlorId },
  terms: {
    pachinko: { rentalTokens: "250", exchangeTokens: "280", replayPaidOut: "125", replayDeducted: "133" },
    slot: { rentalTokens: "", exchangeTokens: "", replayPaidOut: "25", replayDeducted: "25" },
  },
  presses: {},
}

const FOUR = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 125 } }
const ONE = { ...FOUR, rental: { yen: 1000, tokens: 1000 } }

describe("a parlor setting kept for its business day", () => {
  test("is recalled as it was written, on the day it was made", () => {
    expect(recalledParlorSetting(writtenParlorSetting(DAY, SETTING), DAY)).toEqual(SETTING)
  })

  test("is not the next day's", () => {
    expect(recalledParlorSetting(writtenParlorSetting(DAY, SETTING), "2026-10-08" as IsoDate)).toBeUndefined()
  })

  test("is nothing where none was kept, or what was kept does not read as one", () => {
    expect(recalledParlorSetting(undefined, DAY)).toBeUndefined()
    expect(recalledParlorSetting("{", DAY)).toBeUndefined()
    expect(recalledParlorSetting(JSON.stringify({ day: DAY, parlor: { type: "listed" }, terms: SETTING.terms }), DAY)).toBeUndefined()
    expect(recalledParlorSetting(JSON.stringify({ day: DAY, parlor: SETTING.parlor, terms: { pachinko: SETTING.terms.pachinko } }), DAY)).toBeUndefined()
  })
})

describe("what a press adds at the day's parlor", () => {
  const written = writtenParlorSetting(DAY, SETTING)

  test("is kept with the setting by the rate tokens rent at, one rate's beside another's", () => {
    const set = withPresses(withPresses(written, DAY, FOUR, { rental: 1000 }), DAY, ONE, { rental: 200, draw: 500 })
    const recalled = recalledParlorSetting(set, DAY)
    expect(pressesAt(recalled, FOUR)).toEqual({ rental: 1000 })
    expect(pressesAt(recalled, ONE)).toEqual({ rental: 200, draw: 500 })
    expect(pressesAt(recalled, undefined)).toEqual({})
    expect(recalled?.parlor).toEqual(SETTING.parlor)
  })

  test("has nowhere to be kept without a setting made that day, and is none in a setting kept before presses were", () => {
    expect(withPresses(written, "2026-10-08" as IsoDate, FOUR, { rental: 1000 })).toBeUndefined()
    expect(withPresses(undefined, DAY, FOUR, { rental: 1000 })).toBeUndefined()
    expect(recalledParlorSetting(JSON.stringify({ day: DAY, parlor: SETTING.parlor, terms: SETTING.terms }), DAY)).toEqual(SETTING)
  })

  test("is dropped where it does not read as an amount", () => {
    const kept = JSON.stringify({ day: DAY, parlor: SETTING.parlor, terms: SETTING.terms, presses: { "1000/250": { rental: 0, draw: 12345 } } })
    expect(pressesAt(recalledParlorSetting(kept, DAY), FOUR)).toEqual({})
  })
})
