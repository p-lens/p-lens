import { Show, type JSX } from "solid-js"

/** One figure of where a play stands, under its name, with its unit or a word on it after it where it has one. */
export function Tile(props: { readonly label: string; readonly value: string; readonly note?: string | undefined }): JSX.Element {
  return (
    <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
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
