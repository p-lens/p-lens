import { Show, type JSX } from "solid-js"

/**
 * The thin bar across the top of the frame: room for a title in the middle and
 * for anything either side of it. Each is optional, and what it says is the
 * host's to decide; with nothing in it the bar is a strip across the top.
 */
export function TopBar(props: { readonly title?: JSX.Element; readonly leading?: JSX.Element; readonly trailing?: JSX.Element }): JSX.Element {
  return (
    <header class="grid h-8 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 bg-surface-0 px-3 text-sm">
      <div class="flex min-w-0 items-center gap-2">
        <Show when={props.leading}>{props.leading}</Show>
      </div>
      <div class="flex min-w-0 items-center justify-center gap-2 truncate font-semibold text-text-primary">
        <Show when={props.title}>{props.title}</Show>
      </div>
      <div class="flex min-w-0 items-center justify-end gap-2">
        <Show when={props.trailing}>{props.trailing}</Show>
      </div>
    </header>
  )
}
