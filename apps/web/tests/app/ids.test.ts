import { describe, expect, test } from "bun:test"

import { freshUuidV7, uuidV7On } from "../../src/app/composition/ids"

describe("a play id for a day already past", () => {
  test("sorts by that day among ids made on the days around it, and keeps the rest of the id", () => {
    const fresh = freshUuidV7()
    const [before, on, after] = ["2026-09-29", "2026-09-30", "2026-10-01"].map((date) => uuidV7On(fresh, date as never))
    expect([after, before, on].toSorted()).toEqual([before, on, after])
    expect(on?.slice(13)).toBe(fresh.slice(13))
    expect(uuidV7On(fresh, "2026-09-30" as never)).toBe(on as never)
  })

  test("an id made that evening sorts after it, one made the evening before sorts ahead", () => {
    const fresh = freshUuidV7()
    const on = uuidV7On(fresh, "2026-09-30" as never)
    const evening = uuidV7On(fresh, "2026-09-30" as never).replace(/^.{13}/, (time) => (BigInt(`0x${time.replace("-", "")}`) + 72_000_000n).toString(16).padStart(12, "0").replace(/^(.{8})/, "$1-"))
    expect(on < evening).toBe(true)
    expect(evening < uuidV7On(fresh, "2026-10-01" as never)).toBe(true)
  })

  test("is placed at the day's midnight in UTC — nine in the morning in Japan — whatever the device's clock is set to", () => {
    const on = uuidV7On(freshUuidV7(), "2026-09-30" as never)
    expect(Number.parseInt(on.slice(0, 13).replace("-", ""), 16)).toBe(Date.UTC(2026, 8, 30))
    expect(new Date(Date.UTC(2026, 8, 30)).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })).toBe("09:00")
  })

  test("a day no id can hold leaves the id as it was made", () => {
    const fresh = freshUuidV7()
    expect(uuidV7On(fresh, "1960-01-01" as never)).toBe(fresh)
  })
})
