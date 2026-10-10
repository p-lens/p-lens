import { describe, expect, test } from "bun:test"

import type { MemberId } from "../../src/core/book/book"
import type { BookFiles } from "../../src/core/journal/layout"
import { MARKS_LOG, NO_MARKS, deedOf, marksOf, pressOf, withMarkLine, type MarkDeed, type MarkLine } from "../../src/core/marks/marks"

const ME = "me" as MemberId
const OTHER = "other" as MemberId

const press = (at: string, did: MarkDeed, id: string, machineId = "mori", type: "formula" | "distribution" = "formula", by: MemberId = ME): MarkLine => ({
  id: `${at}-${id}-${did}`,
  at: `2026-10-01T${at}:00.000Z`,
  by,
  did,
  target: { type, id },
  machineId,
})

const pressed = (...lines: readonly MarkLine[]): BookFiles => lines.reduce<BookFiles>(withMarkLine, {})

describe("a book's marks", () => {
  test("are written a line a press, only ever added to, each line shaped as the activity's are", () => {
    const files = pressed(press("10:00", "adoption-given", "a"), press("10:05", "adoption-taken-back", "a"))
    expect(files[MARKS_LOG]).toBe(
      '{"v":1,"id":"10:00-a-adoption-given","at":"2026-10-01T10:00:00.000Z","by":"me","did":"adoption-given","mark":{"target":"formula","id":"a","machine":"mori"}}\n' +
        '{"v":1,"id":"10:05-a-adoption-taken-back","at":"2026-10-01T10:05:00.000Z","by":"me","did":"adoption-taken-back","mark":{"target":"formula","id":"a","machine":"mori"}}\n',
    )
  })

  test("are nothing in a book that never held any, and nothing on what was never pressed", () => {
    expect(marksOf({}, ME).size).toBe(0)
    expect(marksOf(pressed(press("10:00", "rejection-given", "a")), ME).get("b") ?? NO_MARKS).toEqual(NO_MARKS)
  })

  test("an adoption is one a machine, moved by adopting another of its kind, and lets go of nothing else", () => {
    const held = marksOf(
      pressed(
        press("10:00", "rejection-given", "b"),
        press("10:01", "adoption-given", "a"),
        press("10:02", "adoption-given", "elsewhere", "ryusei"),
        press("10:03", "adoption-given", "weekday", "mori", "distribution"),
        press("10:04", "adoption-given", "b"),
      ),
      ME,
    )
    expect(held.get("a")).toMatchObject({ adopted: false })
    expect(held.get("b")).toMatchObject({ adopted: true, rejected: true })
    expect(held.get("elsewhere")).toMatchObject({ adopted: true })
    expect(held.get("weekday")).toMatchObject({ adopted: true })
  })

  test("a rejection is one a formula, as many as deserve it, and either it or an adoption is taken back on its own", () => {
    const both = pressed(press("10:00", "adoption-given", "a"), press("10:01", "rejection-given", "a"), press("10:02", "rejection-given", "b"))
    expect([marksOf(both, ME).get("a"), marksOf(both, ME).get("b")]).toMatchObject([{ adopted: true, rejected: true }, { adopted: false, rejected: true }])
    expect(marksOf(withMarkLine(both, press("10:03", "adoption-taken-back", "a")), ME).get("a")).toMatchObject({ adopted: false, rejected: true })
  })

  test("a check either way is given once and stands, the two side by side", () => {
    const held = marksOf(pressed(press("10:00", "verification-given", "a"), press("10:01", "verification-given", "a"), press("10:02", "refutation-given", "a")), ME)
    expect(held.get("a")).toEqual({ adopted: false, rejected: false, verified: true, refuted: true })
    expect(deedOf("verification", false)).toBeUndefined()
    expect(deedOf("refutation", false)).toBeUndefined()
  })

  test("go by when a press was made, not where its line sits: two devices' lines come together in no order of time", () => {
    const merged = pressed(press("10:05", "adoption-taken-back", "a"), press("10:00", "adoption-given", "a"))
    expect(marksOf(merged, ME).get("a")).toMatchObject({ adopted: false })
    const moved = pressed(press("10:05", "adoption-given", "b"), press("10:00", "adoption-given", "a"))
    expect([marksOf(moved, ME).get("a")?.adopted, marksOf(moved, ME).get("b")?.adopted]).toEqual([false, true])
  })

  test("are each member's own: another member's presses in the same book are theirs", () => {
    const files = pressed(press("10:00", "adoption-given", "a"), press("10:01", "adoption-given", "b", "mori", "formula", OTHER), press("10:02", "verification-given", "a", "mori", "formula", OTHER))
    expect(marksOf(files, ME).get("a")).toEqual({ ...NO_MARKS, adopted: true })
    expect(marksOf(files, ME).has("b")).toBe(false)
    expect(marksOf(files, OTHER).get("a")).toEqual({ ...NO_MARKS, verified: true })
  })

  test("pass over a line that does not read, is of another version, or says a word not known, and keep the rest", () => {
    const text = [
      "not json",
      '{"v":2,"id":"a","at":"2026-10-01T10:00:00.000Z","by":"me","did":"adoption-given","mark":{"target":"formula","id":"f9","machine":"mori"}}',
      '{"v":1,"id":"b","at":"2026-10-01T10:00:00.000Z","by":"me","did":"adoption-given","mark":{"target":"formula","id":"f8"}}',
      '{"v":1,"id":"c","at":"2026-10-01T10:00:00.000Z","by":"me","did":"adoption-doubled","mark":{"target":"formula","id":"f7","machine":"mori"}}',
      "",
    ].join("\n")
    expect([...marksOf(withMarkLine({ [MARKS_LOG]: text }, press("10:05", "rejection-given", "f1")), ME).keys()]).toEqual(["f1"])
  })

  test("a deed is the word for a mark set or cleared, and says back what the shared catalog is told", () => {
    expect([deedOf("adoption", true), deedOf("adoption", false), deedOf("rejection", false), deedOf("verification", true)]).toEqual(["adoption-given", "adoption-taken-back", "rejection-taken-back", "verification-given"])
    expect([pressOf("adoption-taken-back"), pressOf("refutation-given")]).toEqual([{ mark: "adoption", on: false }, { mark: "refutation", on: true }])
  })
})
