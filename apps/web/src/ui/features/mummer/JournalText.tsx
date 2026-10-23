import { Show, type JSX } from "solid-js"

import { isWholeShown, veil, type Secret } from "../../../mummer"
import { WITHHELD } from "../../wording/mummer"

const LOOK = "overflow-x-auto rounded-md bg-surface-0 p-3 font-mono text-xs leading-relaxed text-text-secondary"

/** How many lines a journal's text takes as it is drawn: a line break at its end begins no line. */
const linesOf = (text: string): number => text.replace(/\n+$/, "").split("\n").length

/**
 * A journal's text as it is written, in its dark box; or, while 配信モード
 * withholds it, the same box as many lines tall, empty but for the words
 * that say so — so that on a stream it is still seen where an entry
 * stands and how large it is, and a page scrolled to its end does not
 * jump. The lines are blank lines of the same font, never a blur.
 */
export function JournalText(props: { readonly text: Secret<"journal", string>; readonly measured?: (box: HTMLPreElement) => void }): JSX.Element {
  return (
    <Show
      when={isWholeShown("journal")}
      fallback={
        <pre ref={(box) => props.measured?.(box)} class={`relative ${LOOK}`}>
          <span aria-hidden="true">{Array.from({ length: veil.length(props.text, linesOf, 1) }, () => " ").join("\n")}</span>
          <span class="absolute inset-0 flex items-center justify-center font-sans text-sm text-text-muted">{WITHHELD}</span>
        </pre>
      }
    >
      <pre ref={(box) => props.measured?.(box)} class={LOOK}>
        {veil.text(props.text, (shown) => shown, "")}
      </pre>
    </Show>
  )
}
