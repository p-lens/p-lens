import type { PachislotStart } from "../../live/start-form"

const sameMachine = (left: PachislotStart["machine"], right: PachislotStart["machine"]): boolean =>
  left.type === "catalog" && right.type === "catalog" ? left.machineId === right.machineId : left.type === right.type

/** What one machine's choice and seat leave behind when another is chosen. */
const FORGOTTEN_SEAT = {
  formulaId: undefined,
  prior: undefined,
  seatBonuses: {},
  seatAfterReset: false,
  seatSinceCz: "",
  seatMisses: "",
  seatHeld: "",
} as const

/**
 * A change to what starting a pachislot play has chosen. Another machine
 * than before lets go of the formula, the prior and the bonuses read for the
 * one before, unless the change chooses them too.
 */
export const withChange = (chosen: PachislotStart, change: Partial<PachislotStart>): PachislotStart => {
  const switched = change.machine !== undefined && !sameMachine(change.machine, chosen.machine)
  return { ...(switched ? { ...chosen, ...FORGOTTEN_SEAT } : chosen), ...change }
}
