import { describe, expect, test } from "bun:test"

import { visiblePanes } from "../src/panes"
import { clampSize } from "../src/resize"

describe("visiblePanes", () => {
  test("a wide arrangement shows every pane, the detail only when there is one", () => {
    expect(visiblePanes("wide", "selection", true)).toEqual({ selection: true, content: true, detail: true })
    expect(visiblePanes("wide", "detail", false)).toEqual({ selection: true, content: true, detail: false })
  })

  test("a narrow arrangement shows exactly the pane in focus", () => {
    expect(visiblePanes("narrow", "selection", true)).toEqual({ selection: true, content: false, detail: false })
    expect(visiblePanes("narrow", "content", true)).toEqual({ selection: false, content: true, detail: false })
    expect(visiblePanes("narrow", "detail", true)).toEqual({ selection: false, content: false, detail: true })
  })

  test("a detail in focus with nothing to show falls back to the content", () => {
    expect(visiblePanes("narrow", "detail", false)).toEqual({ selection: false, content: true, detail: false })
  })
})

describe("clampSize", () => {
  test("keeps a size within its bounds", () => {
    expect(clampSize(100, 200, 360)).toBe(200)
    expect(clampSize(500, 200, 360)).toBe(360)
    expect(clampSize(250, 200, 360)).toBe(250)
  })

  test("a minimum above the maximum yields to the maximum", () => {
    expect(clampSize(300, 400, 320)).toBe(320)
  })
})
