import type { BusinessDayTurn } from "../../core/calendar/calendar"
import type { GameKind } from "../../core/catalog/catalog"

/**
 * What a person has set for this device, beyond how it looks: kept on the
 * device and read whenever it is needed, so a change takes hold at once.
 * It is this device's alone, and is not carried to a person's others.
 */
export interface Preferences {
  /** The hour of the morning a business day turns over at. */
  readonly businessDayTurn: () => BusinessDayTurn
  readonly setBusinessDayTurn: (turn: BusinessDayTurn) => void
  /** The day's parlor setting, as the start form and a reading's buttons wrote it, or none yet. */
  readonly parlorSetting: () => string | undefined
  readonly setParlorSetting: (written: string) => void
  /** A formula of a game the shared catalog did not take, as it was written to be sent again, or none. */
  readonly formulaDraft: (gameKind: GameKind) => string | undefined
  readonly setFormulaDraft: (gameKind: GameKind, written: string | undefined) => void
  /** Whether the consolidation of several books is shown on the rail; not, until it is turned on. */
  readonly consolidationShown: () => boolean
  readonly setConsolidationShown: (shown: boolean) => void
}
