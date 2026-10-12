/** What making a run of a play's readings one line is called, on the button that does it. */
export const MERGE_READINGS = "履歴をまとめる"

/** What is asked before a run of readings is made one: how many, and what becomes of them. */
export const mergeSays = (readings: number): string => `${String(readings)}件の記録を、最後の1件にまとめます。カウントした小役はそのまま残ります。`

/** What is said once a run of readings is one. */
export const MERGED = "まとめました"

/** What is said where a run of readings could not be made one. */
export const MERGE_FAILED = "履歴をまとめられませんでした"

/** What taking a merging back is called, on the button that stands beside the word that it was done — until that word is closed, after which the lines between are gone for good. */
export const UNMERGE = "取り消す"

/** What is said once a merging is taken back. */
export const UNMERGED = "まとめる前に戻しました"

/** What is said where a merging could not be taken back. */
export const UNMERGE_FAILED = "取り消せませんでした"

/** Why a merging could not be taken back: the play's log is no longer as the merging left it. */
export const CHANGED_SINCE_MERGED = "まとめたあとに記録が変わっています。"
