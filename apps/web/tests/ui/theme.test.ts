import { describe, expect, test } from "bun:test"

import { DEFAULT_THEME, readThemeChoice, resolveAppearance } from "../../src/ui/theme/theme"

describe("theme", () => {
  test("starts dark, not following the device", () => {
    expect(DEFAULT_THEME).toBe("dark")
    expect(readThemeChoice(undefined)).toBe("dark")
    expect(readThemeChoice("sepia")).toBe("dark")
  })

  test("a stored choice is kept as it was", () => {
    expect(readThemeChoice("light")).toBe("light")
    expect(readThemeChoice("system")).toBe("system")
  })

  test("following the device takes its appearance; a fixed choice ignores it", () => {
    expect(resolveAppearance("system", true)).toBe("dark")
    expect(resolveAppearance("system", false)).toBe("light")
    expect(resolveAppearance("light", true)).toBe("light")
    expect(resolveAppearance("dark", false)).toBe("dark")
  })
})
