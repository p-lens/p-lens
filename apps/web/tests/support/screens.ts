/**
 * What is walled off in a folder of its own under `src/`, to be taken out
 * whole: each reached only through its index, its `core/` as pure as the
 * app's and its `application/` knowing no screen.
 */
export const WALLED = ["sample-book", "sunk"] as const

/**
 * Where screens are, under the app's folder: `src/ui/`, and the screens of
 * what is walled off. Every test that holds the screens to something holds
 * all of these, so that a screen does not escape a rule by being kept apart.
 */
export const SCREENS = ["src/ui/", ...WALLED.map((walled) => `src/${walled}/ui/`)] as const
