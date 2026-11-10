import type { MachineId } from "../machine/machine"
import type { MachineSummary } from "./catalog"

/** How many machines a game's search keeps at its head as played lately. */
export const RECENTLY_PLAYED_KEPT = 3

/** The machines played lately, latest first, with the one a play was just started on put at the head: none is kept twice, and the oldest beyond the few kept goes. */
export const playedFirst = (kept: readonly MachineId[], played: MachineId): readonly MachineId[] => [played, ...kept.filter((id) => id !== played)].slice(0, RECENTLY_PLAYED_KEPT)

/** The machines played lately among those delivered, in the order they were played, no more than the few kept however many a book says: one the catalog no longer holds is passed over. */
export const recentlyPlayedAmong = (machines: readonly MachineSummary[], kept: readonly MachineId[]): readonly MachineSummary[] =>
  kept.flatMap((id) => machines.find((machine) => machine.id === id) ?? []).slice(0, RECENTLY_PLAYED_KEPT)
