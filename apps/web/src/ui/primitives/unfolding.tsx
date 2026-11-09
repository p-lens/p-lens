import type { JSX } from "solid-js"

import { cn } from "./cn"

/**
 * A part of a form that unfolds downwards, slowly, as it opens, and folds
 * back up as it closes, rather than appearing or going at once: its height
 * runs between none and its own. Folded, it is still there — nothing in it
 * is lost — but takes no press and no focus, and the gap the form leaves
 * above it is drawn in with it (`gap`, the form's own gap as a negative
 * margin), so that a folded part leaves no room. Where the device asks
 * for less motion, it opens and closes at once. What it holds is given
 * room on its sides and under it as wide as a focus ring, the part
 * reaching out as far on either side, so that the clipping its height
 * runs by does not cut the ring of a field at its edge.
 */
export function Unfolding(props: { readonly open: boolean; readonly gap: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div
      class={cn("grid transition-[grid-template-rows,margin-top,opacity] duration-300 ease-out motion-reduce:transition-none", props.open ? "mt-0 grid-rows-[1fr] opacity-100" : `${props.gap} grid-rows-[0fr] opacity-0`)}
      inert={!props.open}
      aria-hidden={!props.open}
    >
      <div class="-mx-0.5 min-h-0 overflow-hidden">
        <div class="px-0.5 pb-0.5">{props.children}</div>
      </div>
    </div>
  )
}
