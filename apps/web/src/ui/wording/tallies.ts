import { shownNameOf, type MachineNames } from "../../core/catalog/catalog"
import { isZero, toPlainString, type Decimal } from "../../core/decimal/decimal"
import { exchangeRateOf, type PlayTerms } from "../../core/parlor/terms"
import { yenAnHourOf, type Outlay } from "../../core/report/figures"
import type { TallySummary, WonIn } from "../../core/report/tallies"
import type { PlayGameKind } from "../../core/play/play"
import { seal, veil } from "../../mummer"
import { cabinetText } from "./cabinet"
import { formatTheoreticalYen, formatYen } from "./numbers"
import { parlorNameText } from "./parlor"

/** What stands where a tally names no machine. */
export const NO_MACHINE = "機種指定なし"

/** What stands where a tally names no parlor. */
export const NO_PARLOR = "店舗名なし"

/** What is said under an exchange that cannot have been at the play's rate, a line to a sentence. */
export const EXCHANGE_OFF_THE_RATE = ["入力したレートと合いません。", "稼働入力画面に戻ってレート変更可能です。", "このままでも記録はできます。"] as const

/** The exchange rate a tally's play was valued at, as the book keeps it, where its log's head says its terms; its day's otherwise. */
const exchangeRateText = (terms: PlayTerms | undefined): string => (terms === undefined ? "稼働日の交換率" : `交換率${toPlainString(exchangeRateOf(terms))}`)

/** How a tally's 回収 came to yen: the tokens it gave back at its play's exchange rate, or none to say where it was written in yen. */
export const wonCaptions = (gameKind: PlayGameKind | undefined, wonIn: WonIn, terms: PlayTerms | undefined): readonly string[] =>
  wonIn === "yen" ? [] : [`${gameKind === "pachislot" ? "メダル数" : "玉数"}×${exchangeRateText(terms)}で計算`]

/** What a tally's 実収支 was valued at: its play's exchange rate. */
export const actualCaptions = (terms: PlayTerms | undefined): readonly string[] => [`${exchangeRateText(terms)}で評価`]

/**
 * What a tally's 投資 holds beside the tokens played: where none of it was
 * cash, that it was savings alone, with the replay fee it cost where any;
 * where some was, the rental spread and the replay fee it holds, each where
 * it is any, or that it holds no spread — which is all that sets its yen
 * apart from the tokens', savings drawn or not.
 */
export const spentCaptions = (gameKind: PlayGameKind | undefined, outlay: Outlay, paidInCash: boolean): readonly string[] => {
  const tokens = gameKind === "pachislot" ? "メダル" : "玉"
  const held = [
    ...(isZero(outlay.rentalSpread) ? [] : [`貸${tokens}差額${formatYen(seal.tally(outlay.rentalSpread))}`]),
    ...(isZero(outlay.replayFee) ? [] : [`再プレイ手数料${formatYen(seal.tally(outlay.replayFee))}`]),
  ]
  const holding = held.length === 0 ? [] : [`${held.join("と")}を含む`]
  if (!paidInCash) return [`貯${tokens}投資のみ`, ...holding]
  return holding.length === 0 ? [`貸${tokens}差額なし`] : holding
}

/** What a tally's theoretical value comes to for an hour of the time its play lasted; nothing where its length is not known or was none. */
export const workCaptions = (seconds: Decimal | undefined, theoretical: Decimal): readonly string[] => {
  const anHour = seconds === undefined ? undefined : yenAnHourOf(theoretical, seconds)
  return anHour === undefined ? [] : [`1時間単位では${formatTheoreticalYen(seal.tally(anHour))}`]
}

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

/** What marks a play its book already has, in the day's list. */
export const RECORDED_MARK = "記帳済み"
