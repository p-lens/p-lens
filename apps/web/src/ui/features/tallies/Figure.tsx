import { Show, type JSX } from "solid-js"

import type { Decimal } from "../../../core/decimal/decimal"
import { formatSignedYen, formatTheoreticalYen, toneOf, UNSEEN_ACTUAL, UNSEEN_THEORETICAL } from "../../wording/numbers"
import { seal } from "../../../mummer"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

const UNSEEN = { actual: UNSEEN_ACTUAL, theoretical: UNSEEN_THEORETICAL } as const

/**
 * One headline figure, always marked with the way it went. What tallies made is coloured by which
 * way it went; what they were worth by their formulas is not, being a
 * reckoning and no gain or loss. A figure there is none of keeps its
 * shape, dimmed, with nothing in it. Tight enough on a phone for two to stand
 * side by side.
 */
export function Figure(props: {
  readonly label: string
  readonly value: Decimal | undefined
  readonly kind: "actual" | "theoretical"
  readonly caption?: string
  /** Words that stand in the figure's place where there is none to show, which nought would not say. */
  readonly instead?: string | undefined
}): JSX.Element {
  const tone = (): string => (props.value === undefined ? "text-text-muted" : props.kind === "actual" ? TONES[toneOf(seal.tally(props.value))] : TONES.neutral)
  const text = (): string => (props.value === undefined ? UNSEEN[props.kind] : props.kind === "actual" ? formatSignedYen(seal.tally(props.value)) : formatTheoreticalYen(seal.tally(props.value)))
  return (
    <div class="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border px-3 py-2 sm:gap-1 sm:px-4 sm:py-3">
      <dt class="text-xs font-bold uppercase tracking-wide text-text-muted">{props.label}</dt>
      <Show when={props.instead} keyed fallback={<dd class={`text-xl font-bold tabular-nums sm:text-2xl ${tone()}`}>{text()}</dd>}>
        {(words) => <dd class="flex h-7 items-center text-sm text-text-muted sm:h-8">{words}</dd>}
      </Show>
      <Show when={props.caption}>
        <dd class="text-xs text-text-muted">{props.caption}</dd>
      </Show>
    </div>
  )
}
