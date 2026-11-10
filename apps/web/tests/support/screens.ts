import { existsSync, readdirSync } from "node:fs"

/**
 * What is walled off in a folder of its own under `src/`, to be taken out
 * whole: each reached only through its index, its `core/` as pure as the
 * app's and its `application/` knowing no screen.
 */
export const WALLED = ["sample-book", "sunk", "first-touch", "crossing", "other-apps"] as const

/**
 * The other apps of 他アプリ連携, a folder each beside what they share
 * (`core/`, `application/`, `ui/`), each holding its own screens beside
 * its files and use cases.
 */
export const OTHER_APPS: readonly string[] = readdirSync(new URL("../../src/other-apps/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !["core", "application", "ui"].includes(entry.name))
  .map((entry) => entry.name)

/**
 * Where screens are, under the app's folder: `src/ui/`, and the screens of
 * what is walled off, where it has any. Every test that holds the screens to something holds
 * all of these, so that a screen does not escape a rule by being kept apart.
 */
export const SCREENS = ["src/ui/", ...WALLED.map((walled) => `src/${walled}/ui/`).filter((screens) => existsSync(new URL(`../../${screens}`, import.meta.url))), ...OTHER_APPS.map((app) => `src/other-apps/${app}/`)] as const
