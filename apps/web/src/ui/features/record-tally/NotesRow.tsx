import type { JSX } from "solid-js"

import { USER_MEMO_MOST, userMemoLength } from "../../../core/tally/user-memo"
import { offeredUserTags } from "../../../core/tally/user-tags"
import { FoldButton } from "../../primitives/fold-button"
import { NotepadIcon } from "../../primitives/icons"
import { TagsField } from "../../primitives/tags-field"
import { WrappingTextField } from "../../primitives/wrapping-text-field"
import { NOTES_LABEL, notesSays, PRESET_USER_TAGS, USER_MEMO_LABEL, USER_MEMO_PLACEHOLDER, USER_TAGS_LABEL, USER_TAGS_PLACEHOLDER } from "../../wording/user-tags"

/**
 * The words a tally added or set right is tagged with and the note it is
 * written down with, on a row of their own the notes button opens under its
 * own: the tags a third of the row, the note the other two, and the words
 * offered the whole width under both. The book's words are offered, most
 * used first, then the preset ones.
 */
export function NotesRow(props: {
  readonly tags: readonly string[]
  readonly onTagsChange: (tags: readonly string[]) => void
  readonly used: readonly string[]
  readonly memo: string
  readonly onMemoChange: (memo: string) => void
  /** What the note says is wrong with it, where something is. */
  readonly memoError: string | undefined
}): JSX.Element {
  return (
    <div class="grid grid-cols-[1fr_2fr] items-start gap-x-2 gap-y-1.5">
      <TagsField label={USER_TAGS_LABEL} tags={props.tags} onChange={props.onTagsChange} offered={offeredUserTags(props.used, PRESET_USER_TAGS)} placeholder={USER_TAGS_PLACEHOLDER} fieldClass="col-start-1 row-start-1" offeredClass="col-span-2" />
      <div class="col-start-2 row-start-1 min-w-0">
        <WrappingTextField label={USER_MEMO_LABEL} value={props.memo} onChange={props.onMemoChange} placeholder={USER_MEMO_PLACEHOLDER} length={userMemoLength(props.memo)} most={USER_MEMO_MOST} error={props.memoError} />
      </div>
    </div>
  )
}

/** The button beside 期待値 that opens a tally's tags and note under its row, coloured where they hold anything and red where the note runs over. */
export function NotesButton(props: { readonly tags: readonly string[]; readonly memo: string; readonly invalid: boolean; readonly open: boolean; readonly onToggle: () => void }): JSX.Element {
  return <FoldButton label={NOTES_LABEL} says={notesSays(props.open, props.tags.length, props.memo)} marked={props.tags.length > 0 || props.memo.trim() !== ""} invalid={props.invalid} open={props.open} onToggle={props.onToggle} face={<NotepadIcon />} />
}
