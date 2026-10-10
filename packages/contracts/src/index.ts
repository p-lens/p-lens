/**
 * What neither game owns: the shared catalog, how a machine's name is
 * compared and when it may have come out. The pachinko engine's shapes are
 * `./pachinko/engine`, the pachislot engine's `./pachislot/engine`.
 */

export type * from "./catalog.ts"
export { comparableName, isHitChanceText, keptName, MACHINE_BONUSES, MACHINE_KEYWORDS } from "./names.ts"
export { EARLIEST_RELEASE, RELEASE_DAYS_AHEAD, releaseDateProblem, type ReleaseDateProblem } from "./release-date.ts"
