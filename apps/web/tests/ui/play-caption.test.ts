import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PachinkoDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import { captionOf } from "../../src/ui/features/live/play-caption"

const BEGAN = new Date(2026, 9, 23, 13, 42).toISOString()

const PLAY: PachinkoDraft = {
  id: "p-1" as PlayId,
  date: "2026-10-23" as IsoDate,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: "123",
  startedAt: BEGAN,
  log: "",
}

describe("the line under a play in the day's list", () => {
  test("says its cabinet, its parlor and the time it began, for a play of this business day", () => {
    expect(captionOf(PLAY, "2026-10-23" as IsoDate)).toBe("123番台・店舗名なし・13:42〜")
  })

  test("says the date it began too, for a play begun on a day before", () => {
    expect(captionOf(PLAY, "2026-10-24" as IsoDate)).toBe("123番台・店舗名なし・10/23 13:42〜")
  })

  test("says dashes for the cabinet where none was given", () => {
    expect(captionOf({ ...PLAY, cabinetNumber: undefined }, "2026-10-23" as IsoDate)).toBe("----番台・店舗名なし・13:42〜")
  })
})
