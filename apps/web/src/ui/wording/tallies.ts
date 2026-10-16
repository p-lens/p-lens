import { shownNameOf, type MachineNames } from "../../core/catalog/catalog"
import type { TallySummary } from "../../core/report/tallies"

/** What stands where a tally names no machine. */
export const NO_MACHINE = "機種指定なし"

/** What stands where a tally names no parlor. */
export const NO_PARLOR = "店舗名なし"

/**
 * An entry's description as a person reads it: the payee and the note on
 * either side of hledger's bar, each where it is there, with the bar
 * between them only where both are — a bar with a side missing is the
 * book's to keep, not the screen's to show. One written with no bar is
 * shown whole.
 */
export const shownDescription = (description: string): string => {
  const at = description.indexOf("|")
  if (at < 0) return description.trim()
  return [description.slice(0, at), description.slice(at + 1)]
    .map((side) => side.trim())
    .filter((side) => side !== "")
    .join(" | ")
}

/**
 * What a tally is called in a list: its machine, as the halls call it. One that names none was
 * typed in by hand with nothing to call it by, and is called that — its
 * day stands under it already. A tally taken in from another app keeps
 * what that app called it, which is all its description is.
 */
export const tallyTitle = (tally: TallySummary, machineNames: MachineNames): string => (tally.machine === undefined ? undefined : shownNameOf(machineNames, tally.machine)) ?? (tally.importedFrom !== undefined && shownDescription(tally.description) !== "" ? shownDescription(tally.description) : "手入力した収支")
