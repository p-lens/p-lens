import type { BorderGrade, BorderMark, BorderStanding } from "../../../core/pachinko/border-standing"
import type { StretchRate } from "../../../core/pachinko/consumption"
import type { SupportPhase } from "../../../core/pachinko/reading"
import type { RevisionRefusal } from "../../../core/pachinko/revision"
import type { Phase } from "../../../core/play-log/checkpoint"
import { seal } from "../../../mummer"
import { amountText, formatCount, signedAmountText, type Amount } from "../numbers"

/** A cabinet's states as a player calls them. */
export const PHASE_NAMES: Readonly<Record<Phase, string>> = { regular: "通常", special: "確変", rapid: "時短" }

/** The 電サポ's states as its bar shows them while they last. */
export const SUPPORT_NAMES: Readonly<Record<SupportPhase, string>> = { special: "確変中", rapid: "時短中" }

/** The bar's name while the 時短 is the 遊タイム, with no jackpot since. */
export const RELIEF_DRIVE_NAME = "遊タイム中"

/** How a 遊タイム entered by a slip of the finger is left, on either side of the trash icon it names. */
export const RELIEF_DRIVE_SLIP = { before: "遊タイムを押し間違えたときは、上の履歴の末尾をタップして、", after: "で削除してください。" } as const

/** The button beside 記録 that says the 遊タイム was reached at the counter typed. */
export const RELIEF_DRIVE_REACHED = "遊タイム"

/** The button on the bar that says the 電サポ is in the other state. */
export const switchToText = (phase: SupportPhase): string => `${PHASE_NAMES[phase]}に切替`

/** The button that ends the 電サポ, asking for the counter as it stands. */
export const BACK_TO_REGULAR = "通常に戻る"

/** What is asked as the 電サポ ends. */
export const SUPPORT_END_ASKS = "通常に戻ったときの回転数を入力してください。持ち玉は大当りの出玉から見込んだ目安です。数えたら直してください。"

/** What a reading's 持ち玉 says behind its i: a jackpot's 持ち玉 is the hand as it came, the bonus not yet paid, which the play adds itself. */
export const JACKPOT_HELD_NOTE = "ボーナスを同時に選ぶ記録をするときは、持ち玉に当たった時点の数を入れてください（出玉は含めません）。"

/** What a jackpot is called where its machine lists no bonuses to say which it was. */
export const UNTOLD_JACKPOT = "大当り"

/** Balls gained or lost, always signed: `+1,400玉`, `-35玉`. */
export const signedBalls = (balls: Amount<number>): string => `${signedAmountText(balls)}玉`

/** Why a reading cannot be set right or taken away as asked: which reading would then show less on the counter than it must, or hand away more balls than were in hand. */
export const describeRevisionRefusal = (refusal: RevisionRefusal): string => {
  switch (refusal.type) {
    case "counter-went-back":
      return `この変更だと、${String(refusal.index + 1)}件目の回転数が ${formatCount(refusal.expectedAtLeast)} 回転より小さくなってしまいます。大当りの記録か回転数を見直してください。`
    case "handed-beyond-hand":
      return `この変更だと、${String(refusal.index + 1)}件目で渡した玉が、その時の持ち玉（${amountText(seal.play(refusal.held))}玉）より多くなってしまいます。玉の受渡しか持ち玉を見直してください。`
  }
}

/** What a reading says under its 玉の受渡し where more balls are handed away than are in hand: the hand would fall below nothing. */
export const BEYOND_HAND = "持ち玉より多くは渡せません。渡した玉の数か、持ち玉を見直してください。"

/** What making a run of a play's readings one line is called, on the button that does it. */
export const MERGE_READINGS = "履歴をまとめる"

/** What is asked before a run of readings is made one: how many, and what becomes of them. */
export const mergeSays = (readings: number): string => `${String(readings)}件の記録を1件にまとめます。貸玉・貯玉・電サポ増減は合計し、回転数と持ち玉は最後の記録のものになります。`

/** What is said once a run of readings is one. */
export const MERGED = "まとめました"

/** What is said where a run of readings could not be made one. */
export const MERGE_FAILED = "履歴をまとめられませんでした"

/** What taking a merging or a removal back is called, on the button that stands beside the word that it was done — until that word is closed, after which it stands for good. */
export const TAKE_BACK = "取り消す"

/** What is said once a merging is taken back. */
export const UNMERGED = "まとめる前に戻しました"

/** What is said where a merging or a removal could not be taken back. */
export const TAKE_BACK_FAILED = "取り消せませんでした"

/** Why a merging could not be taken back: the play's log is no longer as the merging left it. */
export const CHANGED_SINCE_MERGED = "まとめたあとに記録が変わっています。"

/** What the button that takes a reading away says, for whoever cannot see its bin. */
export const REMOVE_READING = "この記録を削除"

/** What is said once a reading is taken away. */
export const READING_REMOVED = "記録を削除しました"

/** What is said once a removal is taken back. */
export const REMOVAL_TAKEN_BACK = "削除を取り消しました"

/** Why a removal could not be taken back: the play's log is no longer as the removal left it. */
export const CHANGED_SINCE_REMOVED = "削除したあとに記録が変わっています。"

const STANDING_SAYS: Readonly<Record<BorderStanding, string>> = { above: "ボーダーを上回っています", below: "ボーダーを下回っています", level: "ちょうどボーダーです" }

const GRADE_SPAN: Readonly<Record<BorderGrade, string>> = {
  crowned: "5,000円以上",
  shining: "4,000〜5,000円",
  outstanding: "3,000〜4,000円",
  excellent: "2,000〜3,000円",
  strong: "1,750〜2,000円",
  professional: "1,500〜1,750円",
  modest: "1〜1,500円",
  near: "−300〜0円",
  short: "−1,000〜−300円",
  shorter: "−2,000〜−1,000円",
  deep: "−3,000〜−2,000円",
  deepest: "−3,000円未満",
}

const GRADE_FLOOR: Readonly<Record<BorderGrade, string>> = {
  crowned: "5,000円以上",
  shining: "4,000円以上",
  outstanding: "3,000円以上",
  excellent: "2,000円以上",
  strong: "1,750円以上",
  professional: "1,500円以上",
  modest: "1円以上",
  near: "−300円以上",
  short: "−1,000円以上",
  shorter: "−2,000円以上",
  deep: "−3,000円以上",
  deepest: "−3,000円未満",
}

/** Where a grade of mark starts, an hour's worth at 200 spins, as a legend read from the best down says it: `2,000円以上`, and the lowest `−3,000円未満`. */
export const gradeFloorText = (grade: BorderGrade): string => GRADE_FLOOR[grade]

/** What the mark beside a play's spin performance says, for whoever cannot see its colour or its shape. */
export const borderMarkSays = (mark: BorderMark): string =>
  mark.standing === "level" ? STANDING_SAYS.level : `${STANDING_SAYS[mark.standing]}（時給換算 ${GRADE_SPAN[mark.grade]}）`

/** What the button that unfolds a play's figures, and folds them again, is called. */
export const UNFOLD_FIGURES = "すべての数値を表示"
export const FOLD_FIGURES = "数値をたたむ"

/** What is said under a reading's 持ち玉 once the hand has been played long without a count: the hand likely now, where the play has been measured. */
export const recountText = (estimate: Amount<number> | undefined): string => `持ち玉を数え直して${estimate === undefined ? "" : `（推定 ${amountText(estimate)}玉）`}`

/** What a line of the log says of its own stretch's spin performance: the figure, to a tenth, or `-----` while it waits on the hand to be counted after a bonus, in the shape of a figure; and its unit beside it. */
export const stretchRateText = (rate: StretchRate): string => (rate.type === "measured" ? rate.rate.toFixed(1) : "-----")
export const STRETCH_RATE_UNIT = "回転/千円"

/** What a reading's 電サポ増減 says behind its i: a breakdown of the hand, never added to it, kept out of the spin rate and put in the border in place of the formula's. */
export const DRIFT_NOTE = "持ち玉の内訳として記入します。持ち玉欄の数は変わらないので、持ち玉は台の表示を見たまま入れてください。回転率からは除き、ボーダーは機種の電サポ中の出玉増減の代わりにこの数で計算します。"

/** What a reading's 玉の受渡し says behind its i: balls shared with other players, a breakdown of the hand, carried into the hand from the next line on, reaching no figure. */
export const HANDED_NOTE = "主に超ノリ打ち時の出玉共有で記入します。持ち玉を入力後、内訳として入力ください。次の行から受渡し後の持ち玉になります。以後は台間サンドの持玉数をそのまま入れてください。回転率・ボーダーなど、どの計算にも影響しません。"
