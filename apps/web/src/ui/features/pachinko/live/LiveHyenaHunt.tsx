import type { PlayDto } from "@p-lens/contracts/pachinko"
import { createMemo, createResource, createSignal, Show, type JSX } from "solid-js"

import { reliefDriveOf } from "../../../../application/pachinko/hyena-hunt"
import { loadFormula } from "../../../../application/pachinko/formulas"
import { basisOf, type Basis } from "../../../../core/pachinko/formula"
import { borderOf } from "../../../../core/pachinko/theoretical-value"
import type { FormulaSnapshot } from "../../../../core/pachinko/snapshot"
import { useApp } from "../../../context"
import { NoticeDialog } from "../../../primitives/dialog"
import { TargetIcon } from "../../../primitives/icons"
import { HyenaHuntByRate } from "../formulas/HyenaHuntByRate"
import { HyenaHuntRun } from "../formulas/HyenaHuntRun"

/**
 * 遊タイム狙い in the middle of a play, for a machine with a 遊タイム: from the
 * counter as it stands now, at the spin performance this play has had and its
 * exchange rate — whether going on is worth it, and the spin rate at
 * which it breaks even from here. The basis is read from the
 * catalog, since a play carries only its formula's figures.
 *
 * It is a small mark and no more until pressed: whether a machine is worth
 * hunting is settled before sitting down, and a play in progress has its
 * own figures to show. Pressed, it is laid over the screen; nothing of it
 * is worked out before then.
 */
export function LiveHyenaHunt(props: {
  readonly formula: FormulaSnapshot
  readonly counterNow: number
  readonly spinPerformance: number | undefined
  readonly ballValue: number | undefined
}): JSX.Element {
  const app = useApp()
  const [found] = createResource(
    () => ({ machineId: props.formula.machineId, formulaId: props.formula.id }),
    (source) => loadFormula(app.services.catalog, source.machineId, source.formulaId),
  )
  const basis = createMemo((): Basis | undefined => {
    const loaded = found()
    const formulaBasis = loaded?.ok === true ? basisOf(loaded.value.listing.formula) : undefined
    return formulaBasis !== undefined && reliefDriveOf(formulaBasis) !== undefined ? formulaBasis : undefined
  })
  const play = createMemo((): PlayDto | undefined =>
    props.spinPerformance === undefined || props.ballValue === undefined ? undefined : { spinPerformance: props.spinPerformance, ballValue: props.ballValue },
  )
  const [shown, setShown] = createSignal(false)
  return (
    <Show when={basis()}>
      {(known) => (
        <>
          <button
            type="button"
            aria-label="遊タイム狙いを見る"
            title="遊タイム狙い"
            onClick={() => setShown(true)}
            class="flex size-7 shrink-0 items-center justify-center rounded text-semipro-ink hover:bg-surface-3 hover:text-semipro-ink-hover [&_svg]:size-4"
          >
            <TargetIcon />
          </button>
          <NoticeDialog open={shown()} title="遊タイム狙い（ここから打ち続けたら）" acknowledge="閉じる" onAcknowledged={() => setShown(false)}>
            <Show when={props.ballValue} keyed>
              {(ballValue) => <HyenaHuntByRate basis={known()} initialSpins={props.counterNow} ballValue={ballValue} usual={borderOf(props.formula.figures, ballValue)} rate={props.spinPerformance} />}
            </Show>
            <Show when={play()} fallback={<p class="text-xs text-text-muted">投資額と換金レートが分かると、今のデータカウンターから打ち続けた期待値が出ます。</p>}>
              {(conditions) => <HyenaHuntRun basis={known()} initialSpins={props.counterNow} play={conditions()} onUnready={() => undefined} />}
            </Show>
          </NoticeDialog>
        </>
      )}
    </Show>
  )
}
