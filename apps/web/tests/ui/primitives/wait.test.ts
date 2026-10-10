import { describe, expect, test } from "bun:test"

import { waitAfter, type Wait, type WaitEvent } from "../../../src/ui/primitives/wait"

const after = (events: readonly WaitEvent[], from: Wait = { type: "over" }): Wait => events.reduce(waitAfter, from)

describe("a wait on screen", () => {
  test("answered within the quiet never shows it was waited for", () => {
    expect(after(["began"])).toEqual({ type: "quiet" })
    expect(after(["began", "answered"])).toEqual({ type: "over" })
    expect(after(["began", "answered", "quiet-over"])).toEqual({ type: "over" })
  })

  test("shown once the quiet runs out, and kept up until it has been seen, though the answer came", () => {
    expect(after(["began", "quiet-over"])).toEqual({ type: "shown", answered: false, longEnough: false })
    expect(after(["began", "quiet-over", "answered"])).toEqual({ type: "shown", answered: true, longEnough: false })
    expect(after(["began", "quiet-over", "answered", "shown-long-enough"])).toEqual({ type: "over" })
  })

  test("still shown past its time while the answer has not come, and over the moment it does", () => {
    expect(after(["began", "quiet-over", "shown-long-enough"])).toEqual({ type: "shown", answered: false, longEnough: true })
    expect(after(["began", "quiet-over", "shown-long-enough", "answered"])).toEqual({ type: "over" })
  })

  test("waited for again while the sign is up, it is waited out", () => {
    expect(after(["began", "quiet-over", "answered", "began", "shown-long-enough"])).toEqual({ type: "shown", answered: false, longEnough: true })
  })
})
