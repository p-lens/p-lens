import { describe, expect, test } from "bun:test"

import type { PlayId } from "../../src/core/play/play"
import { playGoneText } from "../../src/ui/wording/errors"
import { continueFailedText } from "../../src/ui/wording/play-line"

describe("a play gone as it was to be continued here", () => {
  test("is said moved where it was recorded into another book, and deleted only where it was", () => {
    expect(continueFailedText({ type: "play-gone", playId: "p-1" as PlayId, reason: "moved" })).toBe(playGoneText("moved"))
    expect(continueFailedText({ type: "play-gone", playId: "p-1" as PlayId, reason: "withdrawn" })).toBe(playGoneText("withdrawn"))
    expect(playGoneText("moved")).not.toBe(playGoneText("withdrawn"))
  })
})
