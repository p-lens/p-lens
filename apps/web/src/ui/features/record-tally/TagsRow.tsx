import type { JSX } from "solid-js"

import { offeredUserTags } from "../../../core/tally/user-tags"
import { TagsField } from "../../primitives/tags-field"
import { PRESET_USER_TAGS, USER_TAGS_LABEL, USER_TAGS_PLACEHOLDER } from "../../wording/user-tags"

/**
 * The words a tally added or set right is tagged with, on a row of their
 * own above the entry it writes: the narrower part of the row, the wider
 * kept for a note. The book's words are offered, most used first, then the
 * preset ones.
 */
export function TagsRow(props: { readonly tags: readonly string[]; readonly onChange: (tags: readonly string[]) => void; readonly used: readonly string[] }): JSX.Element {
  return (
    <div class="grid grid-cols-[2fr_3fr] items-start gap-2">
      <div class="min-w-0">
        <TagsField label={USER_TAGS_LABEL} tags={props.tags} onChange={props.onChange} offered={offeredUserTags(props.used, PRESET_USER_TAGS)} placeholder={USER_TAGS_PLACEHOLDER} />
      </div>
    </div>
  )
}
