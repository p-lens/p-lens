import { Index, type JSX } from "solid-js"

import type { GroundsPart } from "../../../wording/pachislot/grounds"

/** A line of grounds as it reads, each figure substituted into it set in bold. */
export function GroundsText(props: { readonly parts: readonly GroundsPart[] }): JSX.Element {
  return <Index each={props.parts}>{(part) => <>{part().type === "figure" ? <b class="font-bold">{part().text}</b> : part().text}</>}</Index>
}
