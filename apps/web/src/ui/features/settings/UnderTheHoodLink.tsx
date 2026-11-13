import type { JSX } from "solid-js"

import { useMoves } from "../../navigation/moves"
import { UNDER_THE_HOOD_LINK } from "../../wording/under-the-hood"

/** A way from a note that says a thing in a line to このアプリの仕様, where the rest of it is said: a link in the note's words, closing the note as it goes. */
export function UnderTheHoodLink(): JSX.Element {
  const moves = useMoves()
  return (
    <button type="button" class="self-start text-accent hover:underline" onClick={() => moves.go({ kind: "settings-section", section: "under-the-hood" })}>
      {UNDER_THE_HOOD_LINK}
    </button>
  )
}
