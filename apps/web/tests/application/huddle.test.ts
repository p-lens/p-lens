import { describe, expect, test } from "bun:test"

import { dismissHuddlePlay, huddleLeftOn, huddleNow, markHuddleLeft, renameInHuddle } from "../../src/application/huddle"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { huddleText, type Huddle } from "../../src/core/huddle/huddle"
import type { PlayId } from "../../src/core/play/play"

const DAY = "2026-10-20" as IsoDate

const HUDDLE: Huddle = { secret: "a".repeat(43), businessDay: DAY, relay: "wss://relay.example.com/3f", seed: "s".repeat(43), member: "e".repeat(64), name: "ルパン", dismissed: [] }

/** What one device keeps of its huddle: its own, and nothing else. */
const device = (kept: Huddle | undefined = HUDDLE) => {
  const held: { huddle: string | undefined } = { huddle: kept === undefined ? undefined : huddleText(kept) }
  return { huddle: () => held.huddle, setHuddle: (written: string | undefined) => (held.huddle = written) }
}

describe("what the device keeps of its huddle, with no relay reached", () => {
  test("is the huddle it is in that business day, and none the next", () => {
    const preferences = device()
    expect(huddleNow(preferences, DAY)).toEqual(HUDDLE)
    expect(huddleNow(preferences, "2026-10-21" as IsoDate)).toBeUndefined()
  })

  test("goes by a new name in the same huddle, as the same member, keeping what was let go of", () => {
    const preferences = device()
    const begun = dismissHuddlePlay(preferences, HUDDLE, "f".repeat(64), "p-9" as PlayId)
    renameInHuddle(preferences, begun, "すばやいおサル")
    expect(huddleNow(preferences, DAY)).toEqual({ ...begun, name: "すばやいおサル" })
  })

  test("lets one of the others' plays go once, however often it is let go of", () => {
    const preferences = device()
    const once = dismissHuddlePlay(preferences, HUDDLE, "f".repeat(64), "p-9" as PlayId)
    expect(dismissHuddlePlay(preferences, once, "f".repeat(64), "p-9" as PlayId).dismissed).toEqual([`${"f".repeat(64)} p-9`])
  })

  test("is left at once, kept that day as left, under the name gone by", () => {
    const preferences = device()
    markHuddleLeft(preferences, HUDDLE)
    expect(huddleNow(preferences, DAY)).toBeUndefined()
    expect(huddleLeftOn(preferences, DAY)?.name).toBe("ルパン")
  })
})
