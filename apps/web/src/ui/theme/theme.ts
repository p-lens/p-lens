import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"

export type Appearance = "light" | "dark"

/** What the person chose: dark, light, or whatever the device uses. Dark until they say otherwise. */
export type ThemeChoice = "system" | Appearance

export const DEFAULT_THEME: ThemeChoice = "dark"

export const resolveAppearance = (choice: ThemeChoice, systemPrefersDark: boolean): Appearance =>
  choice === "system" ? (systemPrefersDark ? "dark" : "light") : choice

export const readThemeChoice = (stored: string | undefined): ThemeChoice =>
  stored === "system" || stored === "light" || stored === "dark" ? stored : DEFAULT_THEME

export interface ThemeState {
  readonly choice: Accessor<ThemeChoice>
  readonly appearance: Accessor<Appearance>
  readonly choose: (choice: ThemeChoice) => void
}

const STORAGE_KEY = "p-lens.theme"

/** localStorage may be absent or refuse; neither is a reason to fail to draw. */
const storedChoice = (): string | undefined => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

const keepChoice = (choice: ThemeChoice): void => {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    return
  }
}

/**
 * The one place the theme lives: the choice, kept on the device, and the
 * appearance it comes to, written onto the document as `data-theme` for the
 * tokens to follow. Must be created inside a reactive owner.
 */
export function createThemeState(): ThemeState {
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)")
  const [systemPrefersDark, setSystemPrefersDark] = createSignal(systemQuery.matches)
  const [choice, setChoice] = createSignal<ThemeChoice>(readThemeChoice(storedChoice()))
  const followSystem = (event: MediaQueryListEvent): void => {
    setSystemPrefersDark(event.matches)
  }
  systemQuery.addEventListener("change", followSystem)
  onCleanup(() => systemQuery.removeEventListener("change", followSystem))

  const appearance = (): Appearance => resolveAppearance(choice(), systemPrefersDark())
  createEffect(() => document.documentElement.setAttribute("data-theme", appearance()))

  return {
    choice,
    appearance,
    choose: (next) => {
      setChoice(next)
      keepChoice(next)
    },
  }
}
