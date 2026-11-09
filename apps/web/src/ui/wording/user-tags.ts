/** The words offered to tag a tally with before the book has used any of its own: the occasions and ways of playing most people tell their plays apart by. */
export const PRESET_USER_TAGS: readonly string[] = ["イベント", "ハイエナ", "天井狙い", "据え置き", "旧イベ", "朝イチ", "設定狙い", "新台"]

/** What the field a tally's words are put on is called. */
export const USER_TAGS_LABEL = "タグ"

/** What the field says while it holds no word. */
export const USER_TAGS_PLACEHOLDER = "タグを追加"

/** What the field a tally's note is written in is called. */
export const USER_MEMO_LABEL = "メモ"

/** What the field a tally's note is written in says while it is empty. */
export const USER_MEMO_PLACEHOLDER = "自由に書けます"

/** The name over the button that opens a tally's tags and note. */
export const NOTES_LABEL = "メモ"

/** What the button that opens a tally's tags and note says to whoever cannot see it: whether it opens or closes them, how many tags they hold, and whether a note is written. */
export const notesSays = (open: boolean, tags: number, memo: string): string =>
  `タグ・メモを${open ? "閉じる" : "開く"}${((held) => (held.length === 0 ? "" : `（${held.join("・")}）`))([...(tags === 0 ? [] : [`タグ${tags}件`]), ...(memo.trim() === "" ? [] : ["メモあり"])])}`
