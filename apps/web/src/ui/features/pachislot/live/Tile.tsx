import { Show, type JSX } from "solid-js"

/** One figure of where a play stands, under its name, with its unit or a word on it after it where it has one: drawn with no frame, a figure to read and nothing to press, apart from the counting tiles beneath. */
export function Tile(props: { readonly label: string; readonly value: string; readonly note?: string | undefined }): JSX.Element {
  return (
    <div class="flex flex-col gap-0.5 px-1 py-1">
      <dt class="text-xs font-bold uppercase tracking-wide text-text-muted">{props.label}</dt>
      <dd class="text-xl font-bold tabular-nums text-text-primary">
        {props.value}
        <Show when={props.note}>
          <span class="ml-1 text-xs font-normal text-text-muted">{props.note}</span>
        </Show>
      </dd>
    </div>
  )
}
