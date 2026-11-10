import { describe, expect, test } from "bun:test"

import { arrangementFor } from "../src/arrangement"

const BOUNDS = { narrowBelow: 768, contentAtLeast: 480 } as const

describe("the arrangement a window calls for", () => {
  test("is narrow below its width, whatever stands beside the content", () => {
    expect(arrangementFor(744, 0, BOUNDS)).toBe("narrow")
    expect(arrangementFor(900, 364, BOUNDS)).toBe("wide")
  })

  test("is narrow where the panes beside the content would leave it too little, as a tablet held sideways with a detail open", () => {
    expect(arrangementFor(1133, 364, BOUNDS)).toBe("wide")
    expect(arrangementFor(800, 364, BOUNDS)).toBe("narrow")
    expect(arrangementFor(1133, 364 + 450, BOUNDS)).toBe("narrow")
    expect(arrangementFor(1440, 364 + 450, BOUNDS)).toBe("wide")
  })
})
