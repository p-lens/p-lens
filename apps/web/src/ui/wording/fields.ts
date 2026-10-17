/** What a field typed wrong says under it, by why it cannot be taken. A field left empty says nothing: it is only nudged, when a press needed it. */
export const FIELD_PROBLEM_TEXT = {
  "not-a-count": "整数で入力してください。",
  "not-a-number": "数字で入力してください。",
  "not-a-date": "日付を入力してください。",
} as const

/** What a field says where it holds what a book's line cannot: a comma, a semicolon or a line break. */
export const UNWRITABLE_TEXT = "「,」「;」や改行は使えません。"
