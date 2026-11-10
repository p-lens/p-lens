import { describe, expect, test } from "bun:test"

import type { IsoMonth } from "../../src/core/calendar/calendar"
import { createShownMonths } from "../../src/ui/features/result-calendar/shown-month"

describe("the month a calendar last showed", () => {
  test("is kept by whose results it shows, the last turned to, and none for a calendar never turned", () => {
    const shown = createShownMonths()
    shown.keep("book\u001fa", "2026-09" as IsoMonth)
    shown.keep("book\u001fa", "2026-08" as IsoMonth)
    shown.keep("consolidated", "2026-10" as IsoMonth)
    expect([shown.of("book\u001fa"), shown.of("consolidated"), shown.of("book\u001fb")]).toEqual(["2026-08", "2026-10", undefined] as never)
  })
})
