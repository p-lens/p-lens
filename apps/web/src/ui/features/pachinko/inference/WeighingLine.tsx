import { Match, Show, Switch, type JSX } from "solid-js"

import type { Weighing } from "../../../../application/pachinko/inference"
import { describeError } from "../../../wording/errors"
import { ANOMALY, borderGapText, frequencyBasisText, frequencyText, inferredValueText, PACE_ASSUMED, spinPerformanceText, UNWEIGHABLE, vagueText, weighingProgressText, weighingText } from "../../../wording/pachinko/inference"

/**
 * What a told play is taken to have been, in a line under its result: the
 * machine being played out, with how far it has got — and that it is
 * being played out many more times, where the usual trials were not
 * enough, said in the warning colour as a wait longer than the usual
 * one — and then the spin
 * performance it is taken to have had against its border and what that
 * made it worth — arriving, not appearing, the wait being the weighing
 * itself. A play out of the ordinary is reported instead, as a machine
 * would report it: that it was detected, how seldom such a play comes and
 * what that figure is of, with no colour and no flourish. A play that
 * told too little says so, and what would help. Nothing while there is
 * nothing to weigh.
 */
export function WeighingLine(props: { readonly weighing: Weighing }): JSX.Element {
  return (
    <Switch>
      <Match when={((now) => (now.type === "weighing" ? now : undefined))(props.weighing)} keyed>
        {(now) => (
          <div class="flex flex-col gap-1" role="status">
            <p class="flex items-center gap-2 text-xs" classList={{ "text-text-muted": !now.beyond, "text-warning": now.beyond }}>
              <span aria-hidden="true" class="block size-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {weighingText(now.beyond)} <span class="tabular-nums">{weighingProgressText(now.done, now.planned)}</span>
            </p>
            <div class="h-0.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
              <div class="h-full bg-accent transition-[width] duration-150" style={{ width: `${(now.done / now.planned) * 100}%` }} />
            </div>
          </div>
        )}
      </Match>
      <Match when={((now) => (now.type === "weighed" ? now : undefined))(props.weighing)} keyed>
        {(now) => (
          <div class="flex flex-col gap-1" role="status">
            <p class="flex origin-left animate-[reveal_480ms_ease-out] flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-text-secondary">
              <span>
                推定回転率 <span class="font-bold tabular-nums text-text-primary">{spinPerformanceText(now.weighed)}</span>
                <span class="text-xs text-text-muted">（{borderGapText(now.weighed)}）</span>
              </span>
              <span>
                推定期待値 <span class="font-bold tabular-nums text-text-primary">{inferredValueText(now.weighed)}</span>
              </span>
            </p>
            <Show when={now.paceAssumed}>
              <p class="text-[11px] text-text-muted">{PACE_ASSUMED}</p>
            </Show>
          </div>
        )}
      </Match>
      <Match when={((now) => (now.type === "anomalous" ? now : undefined))(props.weighing)} keyed>
        {(anomalous) => (
          <div class="flex flex-col gap-1 rounded-[3px] border border-border bg-surface-0 px-4 py-3 font-mono" role="status">
            <p class="text-xs tracking-widest text-text-secondary">{ANOMALY.detected}</p>
            <p class="text-2xl font-bold tabular-nums text-text-primary">{frequencyText(anomalous.oneIn, anomalous.beyond)}</p>
            <p class="text-[11px] text-text-muted">{frequencyBasisText(anomalous.oneIn, anomalous.beyond, anomalous.way)}</p>
            <p class="pt-1 text-[11px] text-text-muted">{ANOMALY.unrecorded}</p>
          </div>
        )}
      </Match>
      <Match when={((now) => (now.type === "vague" ? now : undefined))(props.weighing)} keyed>
        {(vague) => <p class="text-xs text-text-muted">{vagueText(vague.jackpotsTold)}</p>}
      </Match>
      <Match when={((now) => (now.type === "unweighable" ? now.why : undefined))(props.weighing)} keyed>
        {(why) => <p class="text-xs text-text-muted">{UNWEIGHABLE[why]}</p>}
      </Match>
      <Match when={((now) => (now.type === "failed" ? now.error : undefined))(props.weighing)} keyed>
        {(error) => <p class="text-xs text-text-muted">推定できませんでした（{describeError(error)}）</p>}
      </Match>
    </Switch>
  )
}
