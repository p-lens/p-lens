import { describe, expect, test } from "bun:test"

import type { MyMarks } from "../../../src/core/formula/standing"
import { isMine, paintOf } from "../../../src/ui/features/pachislot/formulas/vote-fill"

const none: MyMarks = { adopted: false, rejected: false, verified: false, refuted: false }

describe("a count filled where the person's own mark is among it", () => {
  test("each mark is the person's by its own field of their marks", () => {
    expect(isMine("verification", { ...none, verified: true }, false)).toBe(true)
    expect(isMine("refutation", { ...none, refuted: true }, false)).toBe(true)
    expect(isMine("adoption", { ...none, adopted: true }, false)).toBe(true)
    expect(isMine("rejection", { ...none, rejected: true }, false)).toBe(true)
    expect(isMine("adoption", { ...none, rejected: true }, false)).toBe(false)
  })

  test("a favourite is the book's, not among the marks", () => {
    expect(isMine("favorite", none, true)).toBe(true)
    expect(isMine("favorite", { adopted: true, rejected: true, verified: true, refuted: true }, false)).toBe(false)
  })

  test("only an icon of the person's own mark is painted, inside and rim, in the mark's colour", () => {
    expect(paintOf("adoption", false)).toBeUndefined()
    expect(paintOf("verification", true)).toEqual({ inside: "fill-verification", rim: "stroke-verification" })
    expect(paintOf("refutation", true)).toEqual({ inside: "fill-refutation", rim: "stroke-refutation" })
    expect(paintOf("adoption", true)).toEqual({ inside: "fill-adoption", rim: "stroke-adoption" })
    expect(paintOf("rejection", true)).toEqual({ inside: "fill-rejection", rim: "stroke-rejection" })
  })
})
