import { For, Show, type JSX } from "solid-js"

import { negate, type Decimal } from "../../../core/decimal/decimal"
import type { OtherGains } from "../../../core/report/other-gains"
import { FORFEITED, FORFEITED_NOTE, OTHER_GAINS, REVALUATION, REVALUATION_NOTE } from "../../wording/breakdown"
import { formatSignedYen, toneOf } from "../../wording/numbers"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

/** One line of その他損益: its name and what it is at the left, the figure, coloured by which way it went, at the right. */
function Line(props: { readonly label: string; readonly value: Decimal; readonly note?: string; readonly minor?: boolean }): JSX.Element {
  return (
    <div class={`flex items-baseline justify-between gap-3 py-1 ${props.minor === true ? "pl-3" : ""}`}>
      <dt class="flex min-w-0 flex-col">
        <span class={`break-words text-sm ${props.minor === true ? "text-text-muted" : "text-text-secondary"}`}>{props.label}</span>
        <Show when={props.note}>{(note) => <span class="text-xs text-text-muted">{note()}</span>}</Show>
      </dt>
      <dd class={`shrink-0 text-sm font-semibold tabular-nums ${TONES[toneOf(props.value)]}`}>{formatSignedYen(props.value)}</dd>
    </div>
  )
}

/**
 * その他損益 under a breakdown: what the period gained or lost besides its
 * plays, a line to each and never summed, each saying whether 収支 holds
 * it — 失効損, which it does, and 評価損益, which it does not, parlor by
 * parlor where the tallies are grouped by parlor.
 */
export function OtherGainsSection(props: { readonly gains: OtherGains; readonly byParlor: boolean }): JSX.Element {
  return (
    <section aria-label={OTHER_GAINS} class="flex flex-col gap-1 md:max-w-md">
      <h2 class="text-xs font-semibold text-text-muted">{OTHER_GAINS}</h2>
      <dl class="flex flex-col divide-y divide-border rounded-md bg-surface-1 px-3">
        <Line label={FORFEITED} value={negate(props.gains.forfeited)} note={FORFEITED_NOTE} />
        <div class="flex flex-col">
          <Line label={REVALUATION} value={props.gains.revaluation.total} note={REVALUATION_NOTE} />
          <Show when={props.byParlor}>
            <For each={[...props.gains.revaluation.byParlor]}>{([parlor, yen]) => <Line label={parlor} value={yen} minor />}</For>
          </Show>
        </div>
      </dl>
    </section>
  )
}
