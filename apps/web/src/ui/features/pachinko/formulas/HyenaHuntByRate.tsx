import { createMemo, createResource, For, Show, type JSX } from "solid-js"

import { hyenaHuntAcrossRates, reliefDriveAhead, type HuntAcrossRates, type ReliefDriveAhead } from "../../../../application/pachinko/hyena-hunt"
import type { Basis } from "../../../../core/pachinko/formula"
import { huntBorderOf, huntCurve, huntYenAt, type Hunt } from "../../../../core/pachinko/hyena-hunt"
import { useApp } from "../../../context"
import { sameFields } from "../../../primitives/equality"
import { Loaded } from "../../../primitives/states"
import { formatCount, yenFigureText } from "../../../wording/numbers"
import { borderText } from "../../../wording/pachinko/formula"
import { seal } from "../../../../mummer"

/** The drawing's own units: its whole size, and the box the curve is drawn in. */
const FRAME = { width: 320, height: 166, left: 24, right: 312, top: 22, bottom: 142 } as const

/** How many points the curve is drawn through. */
const POINTS = 40

/** The spin rates a hunt's curve is drawn over: from well under the lower of the two borders to well over the higher. */
const rangeOf = (borders: readonly number[]): { readonly from: number; readonly to: number } => ({ from: Math.min(...borders) * 0.75, to: Math.max(...borders) * 1.35 })

/** Whole spin rates to mark beside the curve, about five of them. */
const marksOf = (from: number, to: number): readonly number[] => {
  const step = Math.max(1, Math.round((to - from) / 5))
  const first = Math.ceil(from / step) * step
  return Array.from({ length: Math.floor((to - first) / step) + 1 }, (_, index) => first + index * step)
}

/**
 * What a hunt comes to at each spin rate, drawn: yen across, the spin rate
 * up — a border is a spin rate, and is read off the side as one. The curve,
 * the line of neither winning nor losing, the rate the hunt breaks even at
 * where the two cross, the formula's own border for play that hunts
 * nothing, and — where one is known — this cabinet's own rate as a dot on
 * the curve. Each border is named on the side of its line away from the
 * other's, so two that run close are still told apart.
 */
function RateChart(props: { readonly hunt: Hunt; readonly border: number; readonly usual: number | undefined; readonly rate: number | undefined }): JSX.Element {
  const range = createMemo(() => rangeOf([props.border, ...(props.usual === undefined ? [] : [props.usual])]))
  const lowest = (): number => Math.min(0, huntYenAt(props.hunt, range().from))
  const highest = (): number => Math.max(0, huntYenAt(props.hunt, range().to))
  const x = (yen: number): number => FRAME.left + ((yen - lowest()) / (highest() - lowest())) * (FRAME.right - FRAME.left)
  const y = (rate: number): number => FRAME.bottom - ((rate - range().from) / (range().to - range().from)) * (FRAME.bottom - FRAME.top)
  const path = (): string =>
    huntCurve(props.hunt, range().from, range().to, POINTS)
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.yen).toFixed(1)} ${y(point.spinPerformance).toFixed(1)}`)
      .join(" ")
  const within = (rate: number | undefined): number | undefined => (rate !== undefined && rate >= range().from && rate <= range().to ? rate : undefined)
  return (
    <svg viewBox={`0 0 ${FRAME.width} ${FRAME.height}`} class="w-full max-w-xl" role="img" aria-label="回転率ごとの期待値">
      <line x1={x(0)} x2={x(0)} y1={FRAME.top} y2={FRAME.bottom} class="stroke-border" stroke-width="1" />
      <text x={x(0)} y={FRAME.bottom + 14} text-anchor="middle" class="fill-text-muted text-[9px] tabular-nums">
        ¥0
      </text>
      <text x={FRAME.right} y={FRAME.bottom + 14} text-anchor="end" class="fill-text-muted text-[9px] tabular-nums">
        {yenFigureText(seal.formula(highest()))}
      </text>
      <text x={FRAME.left} y={FRAME.bottom + 14} text-anchor="start" class="fill-text-muted text-[9px] tabular-nums">
        {yenFigureText(seal.formula(lowest()))}
      </text>
      <For each={marksOf(range().from, range().to)}>
        {(mark) => (
          <text x={FRAME.left - 4} y={y(mark) + 3} text-anchor="end" class="fill-text-muted text-[9px] tabular-nums">
            {mark}
          </text>
        )}
      </For>
      <text x={0} y={FRAME.top - 6} class="fill-text-muted text-[9px]">
        回転/千円
      </text>
      <Show when={within(props.usual)} keyed>
        {(usual) => (
          <>
            <line x1={FRAME.left} x2={FRAME.right} y1={y(usual)} y2={y(usual)} class="stroke-text-muted" stroke-width="1" stroke-dasharray="3 3" />
            <text x={FRAME.left + 3} y={y(usual) + (usual > props.border ? -4 : 11)} class="fill-text-muted text-[9px]">
              通常のボーダー
            </text>
          </>
        )}
      </Show>
      <line x1={FRAME.left} x2={FRAME.right} y1={y(props.border)} y2={y(props.border)} class="stroke-warning" stroke-width="1.5" />
      <text x={FRAME.right - 3} y={y(props.border) + (props.usual !== undefined && props.usual > props.border ? 11 : -4)} text-anchor="end" class="fill-warning text-[9px] font-bold">
        ここから打つボーダー
      </text>
      <path d={path()} fill="none" class="stroke-accent" stroke-width="2" stroke-linejoin="round" />
      <Show when={within(props.rate)} keyed>
        {(rate) => <circle cx={x(huntYenAt(props.hunt, rate))} cy={y(rate)} r="4" classList={{ "fill-positive": huntYenAt(props.hunt, rate) >= 0, "fill-negative": huntYenAt(props.hunt, rate) < 0 }} />}
      </Show>
    </svg>
  )
}

function Figure(props: { readonly label: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <dt class="text-xs font-bold text-text-muted">{props.label}</dt>
      <dd class="text-xl font-bold tabular-nums text-text-primary">{props.children}</dd>
    </div>
  )
}

function Found(props: { readonly found: HuntAcrossRates; readonly ahead: ReliefDriveAhead | undefined; readonly usual: number | undefined; readonly rate: number | undefined }): JSX.Element {
  const border = (): number | undefined => huntBorderOf(props.found.hunt)
  return (
    <div class="flex flex-col gap-3">
      <dl class="grid grid-cols-2 gap-2">
        <Figure label="ここから打つボーダー">
          {border() === undefined ? "--.-" : (border() ?? 0).toFixed(1)}
          <span class="ml-1 text-xs font-normal text-text-muted">回転/千円</span>
        </Figure>
        <Show
          when={props.ahead?.type === "ahead" ? props.ahead : undefined}
          keyed
          fallback={
            <Figure label="遊タイム">
              消化済み
              <span class="block text-xs font-normal text-text-muted">次の大当りまで来ません</span>
            </Figure>
          }
        >
          {(ahead) => (
            <Figure label="遊タイムまで">
              {formatCount(ahead.spins)}
              <span class="ml-1 text-xs font-normal text-text-muted">回転</span>
              <span class="block text-xs font-normal text-text-muted">到達 {(props.found.reliefDriveProbability * 100).toFixed(1)}%</span>
            </Figure>
          )}
        </Show>
      </dl>
      <Show when={border()} keyed>
        {(known) => (
          <>
            <RateChart hunt={props.found.hunt} border={known} usual={props.usual} rate={props.rate} />
            <p class="text-xs text-text-muted">
              この台が{borderText(known)}より回るなら、ここから打って期待値がプラスです。
              <Show when={props.usual} keyed>
                {(usual) => <>通常のボーダーは{borderText(usual)}です。</>}
              </Show>
            </p>
          </>
        )}
      </Show>
    </div>
  )
}

/**
 * 遊タイム狙い from a count, seen across spin rates: how far the 遊タイム is,
 * the spin rate at which sitting down here breaks even, and what it comes
 * to at each rate around it. A hunter does not know a cabinet's rate before
 * sitting, but can tell whether it will beat a figure — so the figure is
 * what is shown, and the rate, where one is known, is a dot on the curve.
 * `usual` is the formula's own border, for setting the hunt's against. A
 * counter past the 遊タイム is said to be: there is nothing left to hunt.
 */
export function HyenaHuntByRate(props: {
  readonly basis: Basis
  readonly initialSpins: number
  readonly ballValue: number
  readonly usual: number | undefined
  readonly rate: number | undefined
}): JSX.Element {
  const app = useApp()
  const asked = createMemo(() => ({ basis: props.basis, ballValue: props.ballValue, initialSpins: props.initialSpins }), undefined, { equals: sameFields })
  const ahead = createMemo(() => reliefDriveAhead(props.basis, props.initialSpins), undefined, { equals: sameFields })
  const [found] = createResource(
    asked,
    (source) => hyenaHuntAcrossRates(app.services.pachinko, source.basis, source.ballValue, source.initialSpins),
  )
  return (
    <Loaded outcome={found()}>
      {(across) => (
        <Show when={across} keyed>
          {(known) => <Found found={known} ahead={ahead()} usual={props.usual} rate={props.rate} />}
        </Show>
      )}
    </Loaded>
  )
}
