import { Match, Show, Switch, type JSX } from "solid-js"

import type { Weighing } from "../../../../application/pachinko/inference"
import { describeError } from "../../../wording/errors"
import { ANOMALY, borderGapText, frequencyBasisText, frequencyText, inferredValueText, PACE_ASSUMED, spinPerformanceText, UNWEIGHABLE, vagueText, weighingProgressText, weighingText } from "../../../wording/pachinko/inference"

/** What a weighing came to is set in: a dark card with a frame, in a machine's own letters, as a machine would report it. */
const CARD = "flex flex-col gap-1 rounded-[3px] border border-border bg-surface-0 px-4 py-3 font-mono"

/**
 * What a told play is taken to have been, in a line under its result: the
 * machine being played out, with how far it has got — and that it is
 * being played out many more times, where the usual trials were not
 * enough, said in the warning colour as a wait longer than the usual
 * one — and then, in a card, what the play is taken to have been worth,
 * with the spin performance it is taken to have had against its border
 * under it — arriving, not appearing, the wait being the weighing
 * itself. A play out of the ordinary is reported instead, in the same
 * card: that it was detected, how seldom such a play comes and
 * what that figure is of, with no colour and no flourish. A play told in
 * full that gave too little to read, and one that could not be weighed,
 * say so in the card too, so whatever a weighing ended in is read in one
 * place. A play that told too little while its jackpots are still to tell
 * is asked for them outside it: that is no ending, the person being about
 * to weigh it again. Nothing while there is nothing to weigh.
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
          <div class={CARD} role="status">
            <p class="text-xs tracking-widest text-text-secondary">推定期待値</p>
            <p class="origin-left animate-[reveal_480ms_ease-out] text-2xl font-bold tabular-nums text-text-primary">{inferredValueText(now.weighed)}</p>
            <p class="text-[11px] text-text-muted">
              推定回転率 <span class="tabular-nums text-text-secondary">{spinPerformanceText(now.weighed)}</span>（{borderGapText(now.weighed)}）
            </p>
            <Show when={now.paceAssumed}>
              <p class="pt-1 text-[11px] text-text-muted">{PACE_ASSUMED}</p>
            </Show>
          </div>
        )}
      </Match>
      <Match when={((now) => (now.type === "anomalous" ? now : undefined))(props.weighing)} keyed>
        {(anomalous) => (
          <div class={CARD} role="status">
            <p class="text-xs tracking-widest text-text-secondary">{ANOMALY.detected}</p>
            <p class="text-2xl font-bold tabular-nums text-text-primary">{frequencyText(anomalous.oneIn, anomalous.beyond)}</p>
            <p class="text-[11px] text-text-muted">{frequencyBasisText(anomalous.oneIn, anomalous.beyond, anomalous.way)}</p>
            <p class="pt-1 text-[11px] text-text-muted">{ANOMALY.unrecorded}</p>
          </div>
        )}
      </Match>
      <Match when={((now) => (now.type === "vague" ? now : undefined))(props.weighing)} keyed>
        {(vague) => (
          <Show when={vague.jackpotsTold} fallback={<p class="text-xs text-text-muted">{vagueText(false)}</p>}>
            <div class={CARD} role="status">
              <p class="text-xs text-text-secondary">{vagueText(true)}</p>
            </div>
          </Show>
        )}
      </Match>
      <Match when={((now) => (now.type === "unweighable" ? now.why : undefined))(props.weighing)} keyed>
        {(why) => (
          <div class={CARD} role="status">
            <p class="text-xs text-text-secondary">{UNWEIGHABLE[why]}</p>
          </div>
        )}
      </Match>
      <Match when={((now) => (now.type === "failed" ? now.error : undefined))(props.weighing)} keyed>
        {(error) => (
          <div class={CARD} role="status">
            <p class="text-xs text-text-secondary">推定できませんでした（{describeError(error)}）</p>
          </div>
        )}
      </Match>
    </Switch>
  )
}
