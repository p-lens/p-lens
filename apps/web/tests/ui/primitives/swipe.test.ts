import { describe, expect, test } from "bun:test"

import { swipedOf } from "../../../src/ui/primitives/swipe"

describe("a finger drawn across", () => {
  test("brings on what comes after towards the left, and back what came before towards the right", () => {
    expect(swipedOf(-80, 10)).toBe("later")
    expect(swipedOf(80, -10)).toBe("earlier")
  })

  test("is no swipe where it went too short a way, or more down than across", () => {
    expect(swipedOf(-40, 0)).toBeUndefined()
    expect(swipedOf(-80, 60)).toBeUndefined()
  })
})
