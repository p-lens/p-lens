import { describe, expect, test } from "bun:test"

import { FIRST_TOUCH_NOTES, noteFor, seenFrom, type Touch } from "../../src/first-touch/core/notes"

const touch = (overrides: Partial<Touch>): Touch => ({ screen: "elsewhere", name: "", tokens: undefined, offBook: false, ...overrides })

const noteOf = (overrides: Partial<Touch>): string | undefined => noteFor(touch(overrides))?.note

describe("a note for what was touched", () => {
  test("is told apart by the screen: the same name means a running total live and nothing elsewhere", () => {
    expect(noteOf({ screen: "live-play", name: "貸玉" })).toBe("rented-total")
    expect(noteOf({ screen: "live-record", name: "貸玉" })).toBeUndefined()
    expect(noteOf({ screen: "live-play", name: "貯玉引出" })).toBe("drawn-total")
    expect(noteOf({ screen: "live-record", name: "貯玉引出" })).toBe("drawn-from-savings")
    expect(noteFor(touch({ screen: "live-play", name: "持ち玉" }))).toEqual({ note: "held-in-hand", tokens: "balls" })
    expect(noteFor(touch({ screen: "live-play", name: "持ちメダル" }))).toEqual({ note: "held-in-hand", tokens: "medals" })
    expect(noteOf({ screen: "tally", name: "回収額" })).toBe("takings")
    expect(noteOf({ screen: "live-record", name: "回収額" })).toBeUndefined()
  })

  test("is told by buttons' and rows' names as a screen reader hears them", () => {
    expect(noteOf({ screen: "live-play", name: "貸玉に500円足す（長押しで変更）" })).toBe("press-amount")
    expect(noteOf({ screen: "live-play", name: "3件目の記録を修正" })).toBe("reading-row")
    expect(noteOf({ screen: "live-play", name: "1,200Gの記録を修正" })).toBe("reading-row")
    expect(noteOf({ screen: "live-play", name: "ボーナス なし" })).toBe("bonus-chosen")
    expect(noteOf({ screen: "live-play", name: "ボーナスの獲得" })).toBeUndefined()
    expect(noteOf({ screen: "live-record", name: "箱で数える" })).toBe("box-count")
  })

  test("of a corner's rates is the same wherever they are typed, worded for the tokens", () => {
    expect(noteFor(touch({ screen: "live-start", name: "貸玉(千円)" }))).toEqual({ note: "rental-rate", tokens: "balls" })
    expect(noteFor(touch({ screen: "tally", name: "貸枚(千円)" }))).toEqual({ note: "rental-rate", tokens: "medals" })
    expect(noteFor(touch({ name: "貸(千円)" }))).toEqual({ note: "rental-rate", tokens: undefined })
    expect(noteFor(touch({ name: "交換(100円)", tokens: "medals" }))).toEqual({ note: "exchange-rate", tokens: "medals" })
  })

  test("of savings is never said of a play at no parlor, whose tokens are no parlor's", () => {
    expect(noteOf({ screen: "live-record", name: "持ち玉" })).toBe("left-to-savings")
    expect(noteOf({ screen: "live-record", name: "持ち玉", offBook: true })).toBeUndefined()
    expect(noteOf({ screen: "live-record", name: "貯メダル引出", offBook: true })).toBeUndefined()
  })

  test("is none for what needs none", () => {
    expect(noteOf({ screen: "live-start", name: "台番号" })).toBeUndefined()
    expect(noteOf({ screen: "tally", name: "日付" })).toBeUndefined()
  })
})

describe("the notes seen, as kept", () => {
  test("are the notes' names in a list, anything else passed over", () => {
    expect([...seenFrom(["takings", "nonsense", 3, "box-count"])].toSorted()).toEqual(["box-count", "takings"])
    expect(seenFrom("takings").size).toBe(0)
    expect(seenFrom(undefined).size).toBe(0)
    expect(seenFrom(FIRST_TOUCH_NOTES).size).toBe(FIRST_TOUCH_NOTES.length)
  })
})
