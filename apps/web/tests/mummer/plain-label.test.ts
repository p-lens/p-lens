import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { businessDayOf } from "../../src/core/calendar/calendar"
import { clearPlainLabel, isPlainLabelShown, startMumming, stopMumming } from "../../src/mummer"
import { plainLabelShown } from "../../src/mummer/mumming"
import { PLAIN_LABEL, PLAIN_LABEL_CLEAR, PLAIN_LABEL_CLEAR_EXPLAINED, PLAIN_LABEL_READ, plainLabelClearedText } from "../../src/ui/wording/mummer"

const forgotten = (): void => {
  startMumming("2026-10-29")
  stopMumming("2026-10-29")
  clearPlainLabel("2026-10-29")
}

beforeEach(forgotten)
afterEach(forgotten)

describe("plainLabelShown", () => {
  test("stands only while not mumming, on the business day mumming was last turned on", () => {
    expect(plainLabelShown({ mumming: false, mummedOn: "2026-10-29" }, "2026-10-29")).toBe(true)
    expect(plainLabelShown({ mumming: true, mummedOn: "2026-10-29" }, "2026-10-29")).toBe(false)
    expect(plainLabelShown({ mumming: false, mummedOn: "2026-10-28" }, "2026-10-29")).toBe(false)
    expect(plainLabelShown({ mumming: false, mummedOn: undefined }, "2026-10-29")).toBe(false)
  })

  test("lapses at the device's business-day turn, not at midnight", () => {
    const mummedOn = businessDayOf(new Date(2026, 9, 29, 22), 5)
    const state = { mumming: false, mummedOn }
    expect(plainLabelShown(state, businessDayOf(new Date(2026, 9, 30, 4, 59), 5))).toBe(true)
    expect(plainLabelShown(state, businessDayOf(new Date(2026, 9, 30, 5), 5))).toBe(false)
    expect(plainLabelShown(state, businessDayOf(new Date(2026, 9, 30, 2, 59), 3))).toBe(true)
    expect(plainLabelShown(state, businessDayOf(new Date(2026, 9, 30, 3), 3))).toBe(false)
  })
})

describe("the plain label on the device", () => {
  test("is not there for one who never mummed, and comes once mumming is turned off on the day it was on", () => {
    expect(isPlainLabelShown("2026-10-29")).toBe(false)
    startMumming("2026-10-29")
    expect(isPlainLabelShown("2026-10-29")).toBe(false)
    stopMumming("2026-10-29")
    expect(isPlainLabelShown("2026-10-29")).toBe(true)
    expect(isPlainLabelShown("2026-10-30")).toBe(false)
  })

  test("cleared while shown, it goes, and mumming again that day brings it back", () => {
    startMumming("2026-10-29")
    stopMumming("2026-10-29")
    expect(clearPlainLabel("2026-10-29")).toBe("cleared")
    expect(isPlainLabelShown("2026-10-29")).toBe(false)
    startMumming("2026-10-29")
    stopMumming("2026-10-29")
    expect(isPlainLabelShown("2026-10-29")).toBe(true)
  })

  test("cleared where it is neither shown nor mumming, nothing changes", () => {
    startMumming("2026-10-29")
    stopMumming("2026-10-29")
    expect(clearPlainLabel("2026-10-30")).toBe("not-shown")
    expect(isPlainLabelShown("2026-10-29")).toBe(true)
  })

  test("cleared while mumming, none comes when mumming is turned off that day, and mumming again brings it back", () => {
    startMumming("2026-10-29")
    expect(clearPlainLabel("2026-10-29")).toBe("kept-off")
    stopMumming("2026-10-29")
    expect(isPlainLabelShown("2026-10-29")).toBe(false)
    startMumming("2026-10-29")
    stopMumming("2026-10-29")
    expect(isPlainLabelShown("2026-10-29")).toBe(true)
  })

  test("comes when mumming carried over from an earlier business day is turned off", () => {
    startMumming("2026-10-29")
    stopMumming("2026-10-30")
    expect(isPlainLabelShown("2026-10-30")).toBe(true)
  })
})

describe("the plain label's words", () => {
  test("name nothing of the person's, and say what clearing came to", () => {
    expect(PLAIN_LABEL).toBe("通常表示")
    expect(PLAIN_LABEL_READ).toBe("通常表示（押すと配信モードにします）")
    expect(PLAIN_LABEL_CLEAR).toBe("通常表示ラベルを消す")
    expect(PLAIN_LABEL_CLEAR_EXPLAINED).toBe("左上の「通常表示」ラベルは営業日が変われば消えますが、このボタンですぐ消せます。")
    expect(plainLabelClearedText("cleared")).toBe("通常表示ラベルを消しました")
    expect(plainLabelClearedText("kept-off")).toBe("次に配信モードを切ったときは、通常表示ラベルを出しません")
    expect(plainLabelClearedText("not-shown")).toBe("通常表示ラベルは出ていません")
  })
})
