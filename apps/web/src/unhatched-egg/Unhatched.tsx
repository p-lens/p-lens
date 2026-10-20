import { Show, type JSX } from "solid-js"

import { isOpen } from "./hatched"

/** What is still in its egg: there only on a device the egg was opened on, and nowhere, not even hidden, on any other. */
export function Unhatched(props: { readonly children: JSX.Element }): JSX.Element {
  return <Show when={isOpen()}>{props.children}</Show>
}
