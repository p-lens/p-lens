import { describe, expect, test } from "bun:test"

import { boxSizeAt, readBoxSizes, tokensInBoxes, withBoxSize, writtenBoxSizes } from "../../../src/core/live-play/box-count"
import type { ParlorIdentity } from "../../../src/core/parlor/parlor"

const LISTED: ParlorIdentity = { type: "listed", id: "parlor-1" as never }
const SUBMITTED: ParlorIdentity = { type: "submitted", submission: "submission-1" as never }

describe("tokens counted by the box", () => {
  test("come to the full boxes at so many each, and those loose", () => {
    expect(tokensInBoxes({ boxes: 3, perBox: 500, loose: 87 })).toBe(1587)
    expect(tokensInBoxes({ boxes: 0, perBox: 500, loose: 40 })).toBe(40)
  })
})

describe("what one box held, kept by parlor and kind of token", () => {
  test("is the one last used at that parlor for that kind, and none elsewhere", () => {
    const sizes = withBoxSize(withBoxSize([], { identity: LISTED, kind: "medal", perBox: 500 }), { identity: LISTED, kind: "medal", perBox: 480 })
    expect(boxSizeAt(sizes, LISTED, "medal")).toBe(480)
    expect(boxSizeAt(sizes, LISTED, "ball")).toBeUndefined()
    expect(boxSizeAt(sizes, SUBMITTED, "medal")).toBeUndefined()
    expect(boxSizeAt(sizes, undefined, "medal")).toBeUndefined()
  })

  test("reads back as it was written, a play at no parlor keeping its own", () => {
    const sizes = withBoxSize(withBoxSize([], { identity: SUBMITTED, kind: "ball", perBox: 2000 }), { identity: undefined, kind: "medal", perBox: 600 })
    const read = readBoxSizes(writtenBoxSizes(sizes))
    expect(boxSizeAt(read, SUBMITTED, "ball")).toBe(2000)
    expect(boxSizeAt(read, undefined, "medal")).toBe(600)
  })

  test("leaves out what does not read, and is none for nothing kept", () => {
    expect(readBoxSizes(undefined)).toEqual([])
    expect(readBoxSizes("{")).toEqual([])
    expect(readBoxSizes(JSON.stringify([{ kind: "medal", perBox: 0 }, { kind: "medal", perBox: 500 }]))).toEqual([{ identity: undefined, kind: "medal", perBox: 500 }])
  })
})
