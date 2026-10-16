import type { NormalizedSpecDto } from "@p-lens/contracts/pachislot"

/** What brings an AT machine's AT, in the words its screens use: its name, and one that came without the AT. */
export interface TriggerWords {
  readonly name: string
  readonly missed: string
}

const CZ: TriggerWords = { name: "CZ", missed: "CZ失敗" }

const BONUS: TriggerWords = { name: "ボーナス", missed: "ATなしボーナス" }

/** The words for a machine's trigger: a bonus where it pays medals of its own, else a CZ, as it is where no formula is at hand to say. */
export const triggerWordsOf = (normalized: NormalizedSpecDto | undefined): TriggerWords => (normalized?.atRules?.triggerPayout === undefined ? CZ : BONUS)
