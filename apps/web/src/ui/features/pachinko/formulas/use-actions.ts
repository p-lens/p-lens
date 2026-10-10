import type { ApplicationError } from "../../../../application/errors"
import type { Formula } from "../../../../core/pachinko/formula"
import { type CheckMark, type FormulaListing, type HeldMark, isHeld, type MyMarks } from "../../../../core/formula/standing"
import { useMoves } from "../../../navigation/moves"
import { useBookMarks } from "../../live/book-marks"
import { useStartForm } from "../../live/start-form"

export interface Actions {
  /** What this member holds on a formula, as the book in use says. */
  readonly mine: (formulaId: string) => MyMarks
  /** Set or clear an adoption or a rejection, then ask again of everything showing it. */
  readonly toggle: (listing: FormulaListing<Formula>, mark: HeldMark, failed: (error: ApplicationError) => void) => void
  /** This member's check either way, given once and standing; `checked` is told once the catalog and the book have it. */
  readonly check: (listing: FormulaListing<Formula>, mark: CheckMark, failed: (error: ApplicationError) => void, checked?: () => void) => void
  /** Take a formula into the start form, and go back to starting the play. */
  readonly use: (formula: Formula, machineName: string) => void
}

export const useActions = (): Actions => {
  const moves = useMoves()
  const start = useStartForm()
  const marks = useBookMarks()
  const targetOf = (listing: FormulaListing<Formula>) => ({ type: "formula", id: listing.formula.id }) as const
  return {
    mine: marks.of,
    toggle: (listing, mark, failed) => marks.press(targetOf(listing), listing.formula.machineId, mark, !isHeld(marks.of(listing.formula.id), mark), failed),
    check: (listing, mark, failed, checked) => marks.press(targetOf(listing), listing.formula.machineId, mark, true, failed, checked),
    use: (formula, machineName) => {
      start.updatePachinko({ machine: { type: "catalog", machineId: formula.machineId, name: machineName }, formulaId: formula.id })
      moves.go({ kind: "live-new", game: "pachinko" })
    },
  }
}
