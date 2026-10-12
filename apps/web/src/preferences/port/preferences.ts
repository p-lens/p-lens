import type { BusinessDayTurn } from "../../core/calendar/calendar"
import type { GameKind } from "../../core/catalog/catalog"

/**
 * What a person has set for this device, beyond how it looks: kept on the
 * device and read whenever it is needed, so a change takes hold at once.
 * It is this device's alone, and is not carried to a person's others —
 * but the hour a business day turns over at, which their own books carry
 * (`application/business-day-turn`) and this only holds as last known.
 */
export interface Preferences {
  /** The hour of the morning a business day turns over at. */
  readonly businessDayTurn: () => BusinessDayTurn
  readonly setBusinessDayTurn: (turn: BusinessDayTurn) => void
  /** The day's parlor setting, as the start form and a reading's buttons wrote it, or none yet. */
  readonly parlorSetting: () => string | undefined
  readonly setParlorSetting: (written: string) => void
  /** The tokens in hand between two plays of a day, as the play that left them wrote them, or none. */
  readonly tokensInHand: () => string | undefined
  readonly setTokensInHand: (written: string | undefined) => void
  /** A formula of a game the shared catalog did not take, as it was written to be sent again, or none. */
  readonly formulaDraft: (gameKind: GameKind) => string | undefined
  readonly setFormulaDraft: (gameKind: GameKind, written: string | undefined) => void
  /** Whether a game's play in progress shows all its figures, unfolded; not, until it is unfolded: a play shows the few figures anyone reads first. */
  readonly figuresUnfolded: (gameKind: GameKind) => boolean
  readonly setFiguresUnfolded: (gameKind: GameKind, unfolded: boolean) => void
  /** Whether the consolidation of several books is shown on the rail; not, until it is turned on. */
  readonly consolidationShown: () => boolean
  readonly setConsolidationShown: (shown: boolean) => void
}
