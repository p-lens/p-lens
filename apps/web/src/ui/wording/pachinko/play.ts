import type { BorderStanding } from "../../../core/pachinko/border-standing"
import type { RevisionRefusal } from "../../../core/pachinko/revision"
import type { Phase } from "../../../core/play-log/checkpoint"

/** A cabinet's states as a player calls them. */
export const PHASE_NAMES: Readonly<Record<Phase, string>> = { regular: "通常", special: "確変", rapid: "時短" }

/** What a jackpot is called where its machine lists no bonuses to say which it was. */
export const UNTOLD_JACKPOT = "大当り"

/** Balls gained or lost, always signed: `+1,400玉`, `-35玉`. */
export const signedBalls = (balls: number): string => `${balls < 0 ? "-" : "+"}${Math.abs(balls).toLocaleString("ja-JP")}玉`

/** Why a reading cannot be set right or taken away as asked: which reading would then show less on the counter than it must. */
export const describeRevisionRefusal = (refusal: RevisionRefusal): string =>
  `この変更だと、${String(refusal.index + 1)}件目の回転数が ${refusal.expectedAtLeast.toLocaleString("ja-JP")} 回転より小さくなってしまいます。大当りの記録か回転数を見直してください。`

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

/** What the dot beside a play's spin performance says, for whoever cannot see its colour. */
export const BORDER_STANDING_SAYS: Readonly<Record<BorderStanding, string>> = { above: "ボーダーを上回っています", below: "ボーダーを下回っています", level: "ちょうどボーダーです" }

/** What the button that unfolds a play's figures, and folds them again, is called. */
export const UNFOLD_FIGURES = "すべての数値を表示"
export const FOLD_FIGURES = "数値をたたむ"

/** What is said under a reading's 持ち玉 once the hand has been played long without a count: the hand likely now, where the play has been measured. */
export const recountText = (estimate: number | undefined): string => `持ち玉を数え直して${estimate === undefined ? "" : `（推定 ${estimate.toLocaleString("ja-JP")}玉）`}`
