import { describe, expect, test } from "bun:test"

import { renderEntry } from "../../src/core/journal/entry"
import { asideOf, asideTags, keptSpinPerformance } from "../../src/core/tally/aside"
import { composeTokenTallyEntry } from "../../src/core/tally/compose"
import { mapOk } from "../../src/core/result/result"
import { PRICES, RENTED_PLAY } from "../support/values"

describe("what is written beside a tally", () => {
  test("is its times as a clock shows them and its spin performance to a tenth, on the line of its description", () => {
    const play = { ...RENTED_PLAY, clock: { started: { hour: 9, minute: 5 }, finished: { hour: 18, minute: 40 } }, spinPerformance: keptSpinPerformance(18.249) }
    expect(asideTags(play)).toEqual([["started", "09:05"], ["finished", "18:40"], ["spin-performance", "18.2"]])
    const header = mapOk(composeTokenTallyEntry(play, PRICES), (entry) => renderEntry(entry).split("\n")[0])
    expect(header.ok && header.value?.endsWith("started: 09:05, finished: 18:40, spin-performance: 18.2")).toBe(true)
  })

  test("is nothing where nothing was said, and only what was", () => {
    expect(asideTags(RENTED_PLAY)).toEqual([])
    expect(asideTags({ ...RENTED_PLAY, clock: { started: undefined, finished: { hour: 0, minute: 30 } } })).toEqual([["finished", "00:30"]])
  })

  test("is who sent its play, by their invitation's id and the name they were given, with nothing that would end a tag", () => {
    const play = { ...RENTED_PLAY, sender: { id: "grant-1", name: "けんじ, 2号" } }
    expect(asideTags(play)).toEqual([["sender-id", "grant-1"], ["sender", "けんじ， 2号"]])
    const tags: Readonly<Record<string, string>> = { "sender-id": "grant-1", sender: "けんじ" }
    expect(asideOf((name) => tags[name]).sender).toEqual({ id: "grant-1", name: "けんじ" })
    expect(asideOf((name) => (name === "sender" ? "けんじ" : undefined)).sender).toBeUndefined()
  })

  test("is read back from tags, a time that is no time read as none", () => {
    const tags: Readonly<Record<string, string>> = { started: "9:05", finished: "25:00", "spin-performance": "17.5" }
    const read = asideOf((name) => tags[name])
    expect(read.clock).toEqual({ started: { hour: 9, minute: 5 }, finished: undefined })
    expect(read.spinPerformance).toEqual(keptSpinPerformance(17.5))
  })
})
