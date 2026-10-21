import type { Decimal } from "../decimal/decimal"
import type { Sides } from "./figures"
import type { TallySummary } from "./tallies"
import type { TallyNotes } from "./tally-notes"

/**
 * One tally with what hledger made of it in yen at its own day's rate,
 * and what it is called by: its parlor and its machine as the lists name
 * them, or — for a tally taken in from another app and not yet tied to the
 * lists — as that app named them, and its maker where that app said.
 */
export interface TallyLine {
  readonly tally: TallySummary
  /** The parlor's name as the book declares it, or as the tally's source named it; none for a tally that names no parlor. */
  readonly parlorName: string | undefined
  /** The machine's name as the catalog has it, or as the tally's source named it; none for a tally that names no machine. */
  readonly machineName: string | undefined
  /** The machine's maker, which only a tally taken in from another app says. */
  readonly maker: string | undefined
  readonly notes: TallyNotes
  readonly sides: Sides
  readonly actual: Decimal
}
