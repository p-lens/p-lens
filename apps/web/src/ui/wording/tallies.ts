import { shownNameOf, type MachineNames } from "../../core/catalog/catalog"
import type { TallySummary } from "../../core/report/tallies"
import { seal, veil } from "../../mummer"
import { cabinetText } from "./cabinet"
import { parlorNameText } from "./parlor"

/** What stands where a tally names no machine. */
export const NO_MACHINE = "機種指定なし"

/** What stands where a tally names no parlor. */
export const NO_PARLOR = "店舗名なし"

/** What is said under an exchange that cannot have been at the play's rate, a line to a sentence. */
export const EXCHANGE_OFF_THE_RATE = ["入力したレートと合いません。", "稼働入力画面に戻ってレート変更可能です。", "このままでも記録はできます。"] as const

/** What stands for a description written by hand with no bar, while parlors are veiled: what it says is anyone's guess, a parlor's name among it. */
const VEILED_DESCRIPTION = "••••"

/** A note with the cabinets it names veiled: `海 123番台` as `海 •••番台` while mumming. */
const noteText = (note: string): string => note.replace(/(\S+)番台/g, (_, number: string) => cabinetText(seal.cabinet(number)))

/**
 * An entry's description as a person reads it: the payee and the note on
 * either side of hledger's bar, each where it is there, with the bar
 * between them only where both are — a bar with a side missing is the
 * book's to keep, not the screen's to show. One written with no bar is
 * shown whole. The payee is a parlor and the note may name a cabinet,
 * and each is shown as 配信モード says; one written with no bar may say
 * anything, and is veiled whole with the parlors.
 */
export const shownDescription = (description: string): string => {
  const at = description.indexOf("|")
  if (at < 0) return ((whole) => (whole === "" ? "" : veil.text(seal.parlor(whole), (shown) => shown, VEILED_DESCRIPTION)))(description.trim())
  const payee = description.slice(0, at).trim()
  const note = description.slice(at + 1).trim()
  return [payee === "" ? undefined : parlorNameText(seal.parlor(payee)), note === "" ? undefined : noteText(note)].filter((side) => side !== undefined).join(" | ")
}

/**
 * What a tally is called in a list: its machine, as the halls call it. One that names none was
 * typed in by hand with nothing to call it by, and is called that — its
 * day stands under it already. A tally taken in from another app keeps
 * what that app called it, which is all its description is.
 */
export const tallyTitle = (tally: TallySummary, machineNames: MachineNames): string => (tally.machine === undefined ? undefined : shownNameOf(machineNames, tally.machine)) ?? (tally.importedFrom !== undefined && shownDescription(tally.description) !== "" ? shownDescription(tally.description) : "手入力した収支")
