import { createSignal } from "solid-js"

import type { Preferences } from "../../../preferences/port/preferences"

/** What the person chose on this page, until the page is opened again and the device's preference is read afresh. */
const [chosen, setChosen] = createSignal<boolean | undefined>(undefined)

/**
 * Whether the consolidation is shown on the rail. It is kept out of sight
 * until a person turns it on: most keep one book, and a way to add several
 * together would only be in their way. The choice is the device's.
 */
export const consolidationShown = (preferences: Preferences): boolean => chosen() ?? preferences.consolidationShown()

/** Show the consolidation on the rail, or put it out of sight again, from now and on this device's later visits. */
export const showConsolidation = (preferences: Preferences, shown: boolean): void => {
  preferences.setConsolidationShown(shown)
  setChosen(shown)
}
