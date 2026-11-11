import { FIELD_PROBLEM_TEXT } from "../fields"

/** What making a run of a play's readings one line is called, on the button that does it. */
export const MERGE_READINGS = "履歴をまとめる"

/** What is asked before a run of readings is made one: how many, and what becomes of them. */
export const mergeSays = (readings: number): string => `${String(readings)}件の記録を、最後の1件にまとめます。カウントした小役はそのまま残ります。`

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

/** What the tab that folds the reading's form away and back is called: whether it is open is said beside it. */
export const COMPOSER_FOLD = "入力欄"

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

/** What a seat's counter field says under it where it cannot be taken: a count that is no count, or games since the AT across bonuses fewer than those since the last bonus. */
export const SEAT_PROBLEM_TEXT: Readonly<Record<"not-a-count" | "below-since-bonus", string>> = {
  "not-a-count": FIELD_PROBLEM_TEXT["not-a-count"],
  "below-since-bonus": "AT間のゲーム数以上にしてください。",
}

/** What a reading's メダルの受渡し says behind its i: medals shared with other players, a breakdown of the hand, carried into the hand from the next line on, reaching no figure. */
export const HANDED_NOTE = "主に超ノリ打ち時の出玉共有で記入します。持ちメダルを入力後、内訳として入力ください。次の行から受渡し後の持ちメダルになります。以後は台間サンドの持ちメダル数をそのまま入れてください。差枚や収支など、どの計算にも影響しません。"
