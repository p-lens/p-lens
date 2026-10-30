import type { PlayDto } from "@p-lens/contracts/pachinko"
import { createMemo, Show, type JSX } from "solid-js"

import type { PachinkoDraft } from "../../../../core/live-play/draft"
import type { Basis } from "../../../../core/pachinko/formula"
import { borderOf } from "../../../../core/pachinko/theoretical-value"
import type { FormulaSnapshot } from "../../../../core/pachinko/snapshot"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { NoticeDialog } from "../../../primitives/dialog"
import { AimIcon } from "../../../primitives/icons"
import { HyenaHuntByRate } from "../formulas/HyenaHuntByRate"
import { HyenaHuntRun } from "../formulas/HyenaHuntRun"
import type { PlayHold } from "../../live/play-hold"
import { GaugeCorrection } from "./GaugeCorrection"

/**
 * 遊タイム狙い in the middle of a play, for a machine with a 遊タイム: from the
 * spins the cabinet stands at toward it now — its own 遊 counter, which is
 * the data counter unless it was said to show otherwise — at the spin
 * performance this play has had and its exchange rate: whether going on is
 * worth it, and the spin rate at which it breaks even from here. Left of
 * its simulation is the 遊 counter as followed, to be set right where the
 * cabinet shows otherwise.
 *
 * It is a small mark and no more until pressed: whether a machine is worth
 * hunting is settled before sitting down, and a play in progress has its
 * own figures to show. Pressed, it is laid over the screen; nothing of it
 * is worked out before then. Whether it is laid over is kept by the
 * screen, above what the play's readings rebuild — a play another device
 * holds has its readings come in as it is watched — so that it stays open
 * through them. A play another device holds has its 遊 counter shown but
 * not set right here.
 */
export function LiveHyenaHunt(props: {
  readonly draft: PachinkoDraft
  readonly hold: PlayHold
  readonly ordered: readonly Checkpoint[]
  readonly formula: FormulaSnapshot
  readonly basis: Basis
  readonly gaugeNow: number
  readonly spinPerformance: number | undefined
  readonly ballValue: number | undefined
  readonly shown: boolean
  readonly onShown: (shown: boolean) => void
}): JSX.Element {
  const play = createMemo((): PlayDto | undefined =>
    props.spinPerformance === undefined || props.ballValue === undefined ? undefined : { spinPerformance: props.spinPerformance, ballValue: props.ballValue },
  )
  const correction = (): JSX.Element => (
    <Show when={props.hold.type === "held"}>
      <GaugeCorrection draft={props.draft} ordered={props.ordered} gaugeNow={props.gaugeNow} />
    </Show>
  )
  return (
    <>
      <button
        type="button"
        aria-label="遊タイム狙いを見る"
        title="遊タイム狙い"
        onClick={() => props.onShown(true)}
        class="flex size-10 shrink-0 items-center justify-center rounded text-semipro-ink hover:bg-surface-3 hover:text-semipro-ink-hover [&_svg]:size-5"
      >
        <AimIcon />
      </button>
      <NoticeDialog open={props.shown} title="遊タイム狙い（ここから打ち続けたら）" acknowledge="閉じる" onAcknowledged={() => props.onShown(false)}>
        <Show when={props.ballValue} keyed>
          {(ballValue) => <HyenaHuntByRate basis={props.basis} initialSpins={props.gaugeNow} ballValue={ballValue} usual={borderOf(props.formula.figures, ballValue)} rate={props.spinPerformance} />}
        </Show>
        <Show
          when={play()}
          fallback={
            <>
              {correction()}
              <p class="text-xs text-text-muted">投資額と交換率が分かると、今の遊カウンターから打ち続けた期待値が出ます。</p>
            </>
          }
        >
          {(conditions) => <HyenaHuntRun basis={props.basis} initialSpins={props.gaugeNow} play={conditions()} onUnready={() => undefined} leading={correction()} />}
        </Show>
      </NoticeDialog>
    </>
  )
}
