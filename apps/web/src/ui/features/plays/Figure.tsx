import { Show, type JSX } from "solid-js"

import type { Decimal } from "../../../core/decimal/decimal"
import { formatSignedYen, formatYen, toneOf } from "../../wording/numbers"

/**
 * One headline figure. A result is signed and coloured by which way it went;
 * a value held is neither, because owning something is not a gain. Tight
 * enough on a phone for two to stand side by side.
 */
export function Figure(props: {
  readonly label: string
  readonly value: Decimal
  readonly kind: "result" | "value"
  readonly caption?: string
  /** Words that stand in the figure's place where there is none to show, which nought would not say. */
  readonly instead?: string | undefined
}): JSX.Element {
  const tone = (): string =>
    props.kind === "value" ? "text-text-primary" : { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" }[toneOf(props.value)]
  return (
    <div class="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border px-3 py-2 sm:gap-1 sm:px-4 sm:py-3">
      <dt class="text-xs font-bold uppercase tracking-wide text-text-muted">{props.label}</dt>
      <Show when={props.instead} keyed fallback={<dd class={`text-xl font-bold tabular-nums sm:text-2xl ${tone()}`}>{props.kind === "result" ? formatSignedYen(props.value) : formatYen(props.value)}</dd>}>
        {(words) => <dd class="flex h-7 items-center text-sm text-text-muted sm:h-8">{words}</dd>}
      </Show>
      <Show when={props.caption}>
        <dd class="text-xs text-text-muted">{props.caption}</dd>
      </Show>
    </div>
  )
}
