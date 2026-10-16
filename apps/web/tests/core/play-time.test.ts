import { describe, expect, test } from "bun:test"

import { decimal, parseDecimal, type Decimal } from "../../src/core/decimal/decimal"
import { playSecondsOf, withPlayTimeDeclaredFor, playTimePosting } from "../../src/core/tally/play-time"

const hours = (text: string): Decimal => ((read) => (read.ok ? read.value : decimal(0n, 0)))(parseDecimal(text))

describe("a play's time", () => {
  test("is its clock's, the finish on the day after where it is earlier, else the hours told, else none", () => {
    expect(playSecondsOf({ started: { hour: 10, minute: 0 }, finished: { hour: 15, minute: 30 } }, hours("2"))).toEqual(decimal(19_800n, 0))
    expect(playSecondsOf({ started: { hour: 22, minute: 0 }, finished: { hour: 1, minute: 15 } }, undefined)).toEqual(decimal(11_700n, 0))
    expect(playSecondsOf({ started: { hour: 10, minute: 0 }, finished: undefined }, hours("3.25"))).toEqual(decimal(11_700n, 0))
    expect(playSecondsOf({ started: { hour: 10, minute: 0 }, finished: { hour: 10, minute: 0 } }, undefined)).toBeUndefined()
    expect(playSecondsOf(undefined, undefined)).toBeUndefined()
  })

  test("declares its seconds and its account once, where an entry posts to it", () => {
    const entry = { date: "2026-10-16" as never, description: "|", tags: [], postings: [playTimePosting(decimal(3_600n, 0))] }
    const declared = withPlayTimeDeclaredFor("commodity 1. JPY\n", entry)
    expect(declared).toBe("commodity 1. JPY\ncommodity 1. 秒\naccount 統計:時間\n")
    expect(withPlayTimeDeclaredFor(declared, entry)).toBe(declared)
    expect(withPlayTimeDeclaredFor("commodity 1. JPY\n", { ...entry, postings: [] })).toBe("commodity 1. JPY\n")
  })
})
