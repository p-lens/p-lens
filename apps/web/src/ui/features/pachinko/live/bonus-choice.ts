import { createResource } from "solid-js"

import { loadMachine } from "../../../../application/pachinko/formulas"
import { bonusGain } from "../../../../core/catalog/bonuses"
import type { MachineBonus } from "../../../../core/catalog/catalog"
import type { PachinkoDraft } from "../../../../core/live-play/draft"
import { seal } from "../../../../mummer"
import { useApp } from "../../../context"
import type { SelectOption } from "../../../primitives/select"
import { signedBalls, UNTOLD_JACKPOT } from "../../../wording/pachinko/play"
import { bonusKey, NO_JACKPOT, UNTOLD } from "./reading-form"

/** The bonuses to choose a jackpot from: none first, then the machine's, each with what it adds to the hand — or, where the machine lists none, a jackpot untold. */
export const jackpotOptions = (bonuses: readonly MachineBonus[]): readonly SelectOption[] => [
  { value: NO_JACKPOT, label: "なし" },
  ...(bonuses.length === 0 ? [{ value: UNTOLD, label: UNTOLD_JACKPOT }] : bonuses.map((bonus) => ({ value: bonusKey(bonus.name), label: `${bonus.name}（${signedBalls(seal.formula(bonusGain(bonus)))}）` }))),
]

/** The bonuses to choose from: those the play took from its formula as it began, or — for a play begun with none — those the catalog has for that formula now. */
export function useBonuses(draft: () => PachinkoDraft): () => readonly MachineBonus[] {
  const app = useApp()
  const [listed] = createResource(
    () => ((draft().bonuses ?? []).length > 0 ? undefined : draft().pachinko?.machineId),
    (machineId) => loadMachine(app.services.catalog, machineId),
  )
  return () => {
    const kept = draft().bonuses ?? []
    const now = listed()
    if (kept.length > 0 || now?.ok !== true) return kept
    return now.value.formulas.find((listing) => listing.formula.id === draft().pachinko?.id)?.formula.bonuses ?? []
  }
}

/** What a bonus chosen paid beyond its machine's by the person's usual over-entry at the cabinet, as the field opens filled: as many more balls a round as they said, over as many rounds as the bonus pays for. Empty where they said none, or the formula says nothing of a round. */
export const usualOverOf = (draft: PachinkoDraft, bonuses: readonly MachineBonus[], chosen: string): string => {
  const bonus = bonuses.find((candidate) => bonusKey(candidate.name) === chosen)
  const overEntry = draft.overEntry
  const perRound = draft.pachinko?.figures.payoutPerRound
  if (bonus === undefined || overEntry === undefined || perRound === undefined || perRound <= 0) return ""
  const over = Math.round((bonusGain(bonus) * overEntry) / perRound)
  return over === 0 ? "" : `${over > 0 ? "+" : ""}${over}`
}
