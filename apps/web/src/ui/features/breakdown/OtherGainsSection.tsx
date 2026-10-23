import { Show, type JSX } from "solid-js"

import { negate, type Decimal } from "../../../core/decimal/decimal"
import type { OtherGains } from "../../../core/report/other-gains"
import { FORFEITED, FORFEITED_NOTE, OTHER_GAINS, REVALUATION, REVALUATION_NOTE } from "../../wording/breakdown"
import { formatSignedYen, toneOf } from "../../wording/numbers"
import { seal } from "../../../mummer"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

/** One line of その他損益: its name and what it is at the left, the figure, coloured by which way it went, at the right. */
function Line(props: { readonly label: string; readonly value: Decimal; readonly note?: string }): JSX.Element {
  return (
    <div class="flex items-baseline justify-between gap-3 py-1">
      <dt class="flex min-w-0 flex-col">
        <span class="break-words text-sm text-text-secondary">{props.label}</span>
        <Show when={props.note}>{(note) => <span class="text-xs text-text-muted">{note()}</span>}</Show>
      </dt>
      <dd class={`shrink-0 text-sm font-semibold tabular-nums ${TONES[toneOf(seal.savings(props.value))]}`}>{formatSignedYen(seal.savings(props.value))}</dd>
    </div>
  )
}

/**
 * その他損益 under 総合: what the period gained or lost besides its plays,
 * a line to each and never summed, each saying that 収支 holds neither —
 * 失効損 and 評価損益.
 */
export function OtherGainsSection(props: { readonly gains: OtherGains }): JSX.Element {
  return (
    <section aria-label={OTHER_GAINS} class="flex flex-col gap-1 md:max-w-md">
      <h2 class="text-xs font-semibold text-text-muted">{OTHER_GAINS}</h2>
      <dl class="flex flex-col divide-y divide-border rounded-md bg-surface-1 px-3">
        <Line label={FORFEITED} value={negate(props.gains.forfeited)} note={FORFEITED_NOTE} />
        <Line label={REVALUATION} value={props.gains.revaluation.total} note={REVALUATION_NOTE} />
      </dl>
    </section>
  )
}
