import type { JSX } from "solid-js"

import { offeredUserTags } from "../../../core/tally/user-tags"
import { FoldButton } from "../../primitives/fold-button"
import { NotepadIcon } from "../../primitives/icons"
import { TagsField } from "../../primitives/tags-field"
import { NOTES_LABEL, notesSays, PRESET_USER_TAGS, USER_TAGS_LABEL, USER_TAGS_PLACEHOLDER } from "../../wording/user-tags"

/**
 * The words a tally added or set right is tagged with, on a row of their
 * own the notes button opens under its own: the field the narrower part of
 * the row, the wider kept for a note, and the words offered the whole width
 * under both. The book's words are offered, most used first, then the
 * preset ones.
 */
export function TagsRow(props: { readonly tags: readonly string[]; readonly onChange: (tags: readonly string[]) => void; readonly used: readonly string[] }): JSX.Element {
  return (
    <div class="grid grid-cols-[2fr_3fr] items-start gap-x-2 gap-y-1.5">
      <TagsField label={USER_TAGS_LABEL} tags={props.tags} onChange={props.onChange} offered={offeredUserTags(props.used, PRESET_USER_TAGS)} placeholder={USER_TAGS_PLACEHOLDER} fieldClass="col-start-1" offeredClass="col-span-2" />
    </div>
  )
}

/** The button beside 期待値 that opens a tally's tags and note under its row, coloured where they hold anything. */
export function NotesButton(props: { readonly tags: readonly string[]; readonly open: boolean; readonly onToggle: () => void }): JSX.Element {
  return <FoldButton label={NOTES_LABEL} says={notesSays(props.open, props.tags.length)} marked={props.tags.length > 0} open={props.open} onToggle={props.onToggle} face={<NotepadIcon />} />
}
