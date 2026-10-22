import { describe, expect, test } from "bun:test"

import { withoutTallyEntry, withTallyEntry } from "../../src/core/tally/in-journal"
import type { PlayId } from "../../src/core/play/play"

const ONE = "2026-10-01 一  ; play-id: one, game-kind: pachinko\n    資産:現金  -1000 JPY\n    費用:遊技  1000 JPY\n"
const TWO = "2026-10-02 二  ; play-id: two, game-kind: pachislot\n    資産:現金  -2000 JPY\n    費用:遊技  2000 JPY\n"
const THREE = "2026-10-03 三  ; game-kind: pachislot, play-id: three\n    資産:現金  -3000 JPY\n    費用:遊技  3000 JPY\n"
const JOURNAL = `; 稼働\n\n${ONE}\n${TWO}\n${THREE}`

const NEW = "2026-09-30 二改  ; play-id: two, game-kind: pachislot\n    資産:現金  500 JPY\n    収益:遊技  -500 JPY\n"

describe("a tally's entry in a journal's text", () => {
  test("is written anew where it stands, every other line as it was", () => {
    expect(withTallyEntry(JOURNAL, "two" as PlayId, NEW)).toBe(`; 稼働\n\n${ONE}\n${NEW}\n${THREE}`)
  })

  test("is found by its play-id wherever the tag stands, and only by the whole id", () => {
    expect(withTallyEntry(JOURNAL, "three" as PlayId, NEW)).toBe(`; 稼働\n\n${ONE}\n${TWO}\n${NEW}`)
    expect(withTallyEntry(JOURNAL, "tw" as PlayId, NEW)).toBeUndefined()
    expect(withTallyEntry(JOURNAL, "one, game-kind" as PlayId, NEW)).toBeUndefined()
  })

  test("is taken out with the blank line that set it apart", () => {
    expect(withoutTallyEntry(JOURNAL, "one" as PlayId)).toBe(`; 稼働\n\n${TWO}\n${THREE}`)
    expect(withoutTallyEntry(JOURNAL, "two" as PlayId)).toBe(`; 稼働\n\n${ONE}\n${THREE}`)
    expect(withoutTallyEntry(JOURNAL, "three" as PlayId)).toBe(`; 稼働\n\n${ONE}\n${TWO}`)
    expect(withoutTallyEntry(ONE, "one" as PlayId)).toBe("")
  })

  test("that a journal does not hold is nothing to write over or take out", () => {
    expect(withTallyEntry(JOURNAL, "four" as PlayId, NEW)).toBeUndefined()
    expect(withoutTallyEntry(JOURNAL, "four" as PlayId)).toBeUndefined()
  })
})
