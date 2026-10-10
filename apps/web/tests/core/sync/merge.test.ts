import { describe, expect, test } from "bun:test"

import { appendEntry } from "../../../src/core/journal/layout"
import { contestedIn, mergeOutline, mergeText, settledText } from "../../../src/core/sync/merge"

const BASE = "; a book\n\n2026-10-01 first\n    a  1\n    b"

describe("two texts grown from one", () => {
  test("a side left as it was takes the other's", () => {
    expect(mergeText(BASE, BASE, `${BASE}\nx`)).toEqual({ ok: true, value: `${BASE}\nx` })
    expect(mergeText(BASE, `${BASE}\nx`, BASE)).toEqual({ ok: true, value: `${BASE}\nx` })
  })

  test("entries each appended are both kept, theirs first", () => {
    const ours = appendEntry(BASE, "2026-10-02 ours\n    a  2\n    b")
    const theirs = appendEntry(BASE, "2026-10-02 theirs\n    a  3\n    b")
    expect(mergeText(BASE, ours, theirs)).toEqual({ ok: true, value: `${BASE}\n\n2026-10-02 theirs\n    a  3\n    b\n\n2026-10-02 ours\n    a  2\n    b` })
  })

  test("the same line added by both is added once", () => {
    expect(mergeText("account a", "account a\naccount b", "account a\naccount b")).toEqual({ ok: true, value: "account a\naccount b" })
  })

  test("changes in different places are both made", () => {
    expect(mergeText("a\nb\nc\nd", "A\nb\nc\nd", "a\nb\nc\nD\ne")).toEqual({ ok: true, value: "A\nb\nc\nD\ne" })
  })

  test("a line added beside one the other side rewrote keeps its side of it", () => {
    expect(mergeText("a\nb", "a\nnew\nb", "a\nB")).toEqual({ ok: true, value: "a\nnew\nB" })
  })

  test("both starting an empty file keep what each wrote", () => {
    expect(mergeText("", "ours", "theirs")).toEqual({ ok: true, value: "theirs\nours" })
  })

  test("a line both rewrote differently is a conflict", () => {
    expect(mergeText("title: a", "title: b", "title: c")).toEqual({ ok: false, error: { type: "conflict" } })
    expect(mergeText("a\nb\nc", "a\nc", "a\nB\nc")).toEqual({ ok: false, error: { type: "conflict" } })
  })

  test("a long journal appended to is merged without comparing all of it", () => {
    const long = Array.from({ length: 60_000 }, (_, index) => `line ${index}`).join("\n")
    expect(mergeText(long, `${long}\nours`, `${long}\ntheirs`)).toEqual({ ok: true, value: `${long}\ntheirs\nours` })
  })
})

describe("where two texts disagree", () => {
  const base = "title: a\n\nentry one\n    cash  -1000\n    rent  1000\n\nentry two"
  const ours = "title: b\n\nentry one\n    cash  -1200\n    rent  1200\n\nentry two\n\nours appended"
  const theirs = "title: c\n\nentry one\n    cash  -1000\n    rent  1000\n\nentry two changed\n\ntheirs appended"

  test("is set apart stretch by stretch, with what they agree on between", () => {
    expect(mergeOutline(base, ours, theirs)).toEqual([
      { type: "contested", ours: ["title: b"], theirs: ["title: c"] },
      { type: "agreed", lines: ["", "entry one", "    cash  -1200", "    rent  1200", "", "entry two changed", "", "theirs appended", "", "ours appended"] },
    ])
    expect(contestedIn(mergeOutline(base, ours, theirs))).toBe(1)
    expect(mergeOutline("a\nb\nc", "A\nb\nC", "x\nb\ny").map((part) => part.type)).toEqual(["contested", "agreed", "contested"])
  })

  test("comes to one text by the side picked for each stretch, theirs where none is", () => {
    const parts = mergeOutline("a\nb\nc", "A\nb\nC", "x\nb\ny")
    expect(settledText(parts, ["ours", "theirs"])).toBe("A\nb\ny")
    expect(settledText(parts, ["theirs", "ours"])).toBe("x\nb\nC")
    expect(settledText(parts, [])).toBe("x\nb\ny")
  })

  test("is nowhere when they merge: the outline is all agreed", () => {
    expect(mergeOutline("a\nb", "a\nb\nours", "a\nb\ntheirs")).toEqual([{ type: "agreed", lines: ["a", "b", "theirs", "ours"] }])
  })
})
