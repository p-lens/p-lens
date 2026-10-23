import { Show, type JSX } from "solid-js"

import { isWholeShown, type KindWith } from "../../../mummer"
import { WITHHELD } from "../../wording/mummer"

/**
 * A part of a screen shown whole, or, while mumming veils its kind, one
 * quiet line declared in its place: never a blur over it, which costs a
 * phone a frame to draw and can be read through. A `silent` one leaves
 * nothing in its place: a press that would open what is withheld, which
 * is better not there than opening onto a line with no way back. An
 * `inline` one says it under a heading of its own, with no room around it.
 */
export function Withheld(props: { readonly kind: KindWith<"whole">; readonly silent?: boolean; readonly inline?: boolean; readonly children: JSX.Element }): JSX.Element {
  return (
    <Show when={isWholeShown(props.kind)} fallback={props.silent === true ? undefined : <p class="text-sm text-text-muted" classList={{ "px-4 py-6": props.inline !== true }}>{WITHHELD}</p>}>
      {props.children}
    </Show>
  )
}
