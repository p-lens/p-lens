import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"

export type Appearance = "light" | "dark"

/** What the person chose: dark, light, or whatever the device uses. Dark until they say otherwise. */
export type AppearanceChoice = "system" | Appearance

export const DEFAULT_APPEARANCE: AppearanceChoice = "dark"

export const LIGHT_THEMES = ["white", "sakura", "khaki", "mint"] as const
export type LightTheme = (typeof LIGHT_THEMES)[number]

export const DARK_THEMES = ["ash", "onyx", "aurora", "bordeaux"] as const
export type DarkTheme = (typeof DARK_THEMES)[number]

export type Theme = LightTheme | DarkTheme

export const DEFAULT_LIGHT_THEME: LightTheme = "white"
export const DEFAULT_DARK_THEME: DarkTheme = "ash"

export const resolveAppearance = (choice: AppearanceChoice, systemPrefersDark: boolean): Appearance =>
  choice === "system" ? (systemPrefersDark ? "dark" : "light") : choice

export const readAppearanceChoice = (stored: string | undefined): AppearanceChoice =>
  stored === "system" || stored === "light" || stored === "dark" ? stored : DEFAULT_APPEARANCE

export const readLightTheme = (stored: string | undefined): LightTheme =>
  LIGHT_THEMES.find((theme) => theme === stored) ?? DEFAULT_LIGHT_THEME

export const readDarkTheme = (stored: string | undefined): DarkTheme =>
  DARK_THEMES.find((theme) => theme === stored) ?? DEFAULT_DARK_THEME

/** The theme drawn: the light one chosen when the appearance is light, the dark one when it is dark. */
export const themeOf = (appearance: Appearance, light: LightTheme, dark: DarkTheme): Theme =>
  appearance === "light" ? light : dark

export interface ThemeState {
  readonly appearanceChoice: Accessor<AppearanceChoice>
  readonly lightTheme: Accessor<LightTheme>
  readonly darkTheme: Accessor<DarkTheme>
  readonly chooseAppearance: (choice: AppearanceChoice) => void
  readonly chooseLightTheme: (theme: LightTheme) => void
  readonly chooseDarkTheme: (theme: DarkTheme) => void
}

const APPEARANCE_KEY = "p-lens.appearance"
const LIGHT_THEME_KEY = "p-lens.theme.light"
const DARK_THEME_KEY = "p-lens.theme.dark"

/** localStorage may be absent or refuse; neither is a reason to fail to draw. */
const stored = (key: string): string | undefined => {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

const keep = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

/** The browser's bar above the page — a phone's status bar — takes the colour of the bar at the page's top, read off the theme's own token. */
const paintStatusBar = (): void => {
  const meta = document.querySelector('meta[name="theme-color"]')
  const colour = getComputedStyle(document.documentElement).getPropertyValue("--surface-0").trim()
  if (meta !== null && colour !== "") meta.setAttribute("content", colour)
}

/**
 * The one place the theme lives: the appearance chosen and the light and
 * dark themes chosen, each kept on the device and never synced, and what
 * they come to, written onto the document as `data-appearance` and
 * `data-theme` for the tokens to follow. Must be created inside a reactive
 * owner.
 */
export function createThemeState(): ThemeState {
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)")
  const [systemPrefersDark, setSystemPrefersDark] = createSignal(systemQuery.matches)
  const [appearanceChoice, setAppearanceChoice] = createSignal<AppearanceChoice>(readAppearanceChoice(stored(APPEARANCE_KEY)))
  const [lightTheme, setLightTheme] = createSignal<LightTheme>(readLightTheme(stored(LIGHT_THEME_KEY)))
  const [darkTheme, setDarkTheme] = createSignal<DarkTheme>(readDarkTheme(stored(DARK_THEME_KEY)))
  const followSystem = (event: MediaQueryListEvent): void => {
    setSystemPrefersDark(event.matches)
  }
  systemQuery.addEventListener("change", followSystem)
  onCleanup(() => systemQuery.removeEventListener("change", followSystem))

  createEffect(() => {
    const appearance = resolveAppearance(appearanceChoice(), systemPrefersDark())
    document.documentElement.setAttribute("data-appearance", appearance)
    document.documentElement.setAttribute("data-theme", themeOf(appearance, lightTheme(), darkTheme()))
    paintStatusBar()
  })

  return {
    appearanceChoice,
    lightTheme,
    darkTheme,
    chooseAppearance: (next) => {
      setAppearanceChoice(next)
      keep(APPEARANCE_KEY, next)
    },
    chooseLightTheme: (next) => {
      setLightTheme(next)
      keep(LIGHT_THEME_KEY, next)
    },
    chooseDarkTheme: (next) => {
      setDarkTheme(next)
      keep(DARK_THEME_KEY, next)
    },
  }
}
