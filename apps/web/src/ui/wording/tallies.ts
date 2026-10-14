import { shownNameOf, type MachineNames } from "../../core/catalog/catalog"
import type { TallySummary } from "../../core/report/tallies"

/** What stands where a tally names no machine. */
export const NO_MACHINE = "機種指定なし"

/** What stands where a tally names no parlor. */
export const NO_PARLOR = "店舗名なし"

/**
 * What a tally is called in a list: its machine, as the halls call it. One that names none was
 * typed in by hand with nothing to call it by, and is called that — its
 * day stands under it already. A tally taken in from another app keeps
 * what that app called it, which is all its description is.
 */
export const tallyTitle = (tally: TallySummary, machineNames: MachineNames): string => (tally.machine === undefined ? undefined : shownNameOf(machineNames, tally.machine)) ?? (tally.importedFrom !== undefined && tally.description.trim() !== "" ? tally.description : "手入力した収支")
