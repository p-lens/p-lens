import { readFileSync } from "node:fs"

import { describe, expect, test } from "bun:test"

import {
  DARK_THEMES,
  DEFAULT_APPEARANCE,
  LIGHT_THEMES,
  readAppearanceChoice,
  readDarkTheme,
  readLightTheme,
  resolveAppearance,
  themeOf,
} from "../../src/ui/theme/theme"

describe("theme", () => {
  test("starts dark in ash, not following the device, with white for light", () => {
    expect(DEFAULT_APPEARANCE).toBe("dark")
    expect(readAppearanceChoice(undefined)).toBe("dark")
    expect(readAppearanceChoice("sepia")).toBe("dark")
    expect(readLightTheme(undefined)).toBe("white")
    expect(readDarkTheme(undefined)).toBe("ash")
  })

  test("a stored choice is kept as it was, and a theme of the other appearance is not taken", () => {
    expect(readAppearanceChoice("light")).toBe("light")
    expect(readAppearanceChoice("system")).toBe("system")
    expect(readLightTheme("sakura")).toBe("sakura")
    expect(readDarkTheme("aurora")).toBe("aurora")
    expect(readLightTheme("aurora")).toBe("white")
    expect(readDarkTheme("mint")).toBe("ash")
  })

  test("following the device takes its appearance; a fixed choice ignores it", () => {
    expect(resolveAppearance("system", true)).toBe("dark")
    expect(resolveAppearance("system", false)).toBe("light")
    expect(resolveAppearance("light", true)).toBe("light")
    expect(resolveAppearance("dark", false)).toBe("dark")
  })

  test("the theme drawn is the one chosen for the appearance", () => {
    expect(themeOf("light", "khaki", "aurora")).toBe("khaki")
    expect(themeOf("dark", "khaki", "bordeaux")).toBe("bordeaux")
  })

  test("every theme has its file, imported, setting every token a theme sets", () => {
    const folder = new URL("../../src/ui/theme/", import.meta.url)
    const tokensOf = (name: string): readonly string[] =>
      [...readFileSync(new URL(`themes/${name}.css`, folder), "utf8").matchAll(/--([a-z0-9-]+):/g)].map((match) => match[1] ?? "").sort()
    const imports = readFileSync(new URL("theme.css", folder), "utf8")
    const white = tokensOf("white")
    for (const theme of [...LIGHT_THEMES, ...DARK_THEMES]) {
      expect(imports).toContain(`@import "./themes/${theme}.css";`)
      expect(tokensOf(theme)).toEqual(white)
    }
  })
})
