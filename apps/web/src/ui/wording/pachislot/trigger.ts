import type { NormalizedSpecDto } from "@p-lens/contracts/pachislot"

/** What brings an AT machine's AT, in the words its screens use: its name, and one that came without the AT. */
export interface TriggerWords {
  readonly name: string
  readonly missed: string
  /** A bonus a CZ's success brought that missed the AT, where the machine has one apart from a failed CZ. */
  readonly bonusMissed: string | undefined
}

const CZ: TriggerWords = { name: "CZ", missed: "CZ失敗", bonusMissed: undefined }

const BONUS: TriggerWords = { name: "ボーナス", missed: "ATなしボーナス", bonusMissed: undefined }

const CZ_THEN_BONUS: TriggerWords = { name: "CZ", missed: "CZ失敗", bonusMissed: "ATなしボーナス" }

/** Whether a CZ's success brings a bonus before the AT: some setting pays the trigger's medals on only some CZs. */
const staged = (normalized: NormalizedSpecDto): boolean => normalized.atRules?.triggerIsBonus !== true && normalized.tables.some((table) => table.at?.paid !== undefined)

/** The words for a machine's trigger: a CZ whose success brings a bonus, a bonus where the formula says so — marked one, or given its medals — else a CZ, as it is where no formula is at hand to say. */
export const triggerWordsOf = (normalized: NormalizedSpecDto | undefined): TriggerWords => {
  if (normalized === undefined) return CZ
  if (staged(normalized)) return CZ_THEN_BONUS
  return normalized.atRules?.triggerIsBonus === true || normalized.atRules?.triggerPayout !== undefined ? BONUS : CZ
}
