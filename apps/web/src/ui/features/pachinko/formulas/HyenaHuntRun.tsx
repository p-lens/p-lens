import type { HyenaHuntSummaryDto, PlayDto } from "@p-lens/contracts/pachinko"
import { createEffect, createMemo, createResource, createSignal, Match, on, onCleanup, Show, Switch, type JSX } from "solid-js"

import { reliefDriveOf, hyenaHuntFrom, hyenaHuntTable } from "../../../../application/pachinko/hyena-hunt"
import type { Basis } from "../../../../core/pachinko/formula"
import { marginAtTrials } from "../../../../core/sampling/margin"
import type { RunningRun } from "../../../../pachinko-engine/client/client"
import type { EngineFailure } from "../../../../pachinko-engine/protocol/messages"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { sameFields } from "../../../primitives/equality"
import { Loaded } from "../../../primitives/states"
import { HelpPopover } from "../../../primitives/popover"
import { TextField } from "../../../primitives/text-field"
import { describeEngineFailure } from "../../../wording/pachinko/engine"
import { formatCount, formatMan, yenFigureText } from "../../../wording/numbers"
import { Histogram } from "./Histogram"
import { seedOf, trialsOf, TRIALS_BY_DEFAULT } from "./sampling-settings"

/** Where a hyena hunt is. A finished or stopped one keeps what it had come to. */
type Run =
  | { readonly type: "idle" }
  | { readonly type: "running"; readonly planned: number; readonly summary: HyenaHuntSummaryDto | undefined; readonly handle: RunningRun }
  | { readonly type: "finished"; readonly summary: HyenaHuntSummaryDto }
  | { readonly type: "cancelled"; readonly summary: HyenaHuntSummaryDto | undefined }
  | { readonly type: "failed"; readonly failure: EngineFailure }


const percentText = (value: number | null | undefined): string => (value === null || value === undefined ? "--" : `${(value * 100).toFixed(1)}%`)

function Figure(props: { readonly label: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div>
      <dt class="text-xs text-text-muted">{props.label}</dt>
      <dd class="tabular-nums">{props.children}</dd>
    </div>
  )
}

function Sampled(props: { readonly summary: HyenaHuntSummaryDto }): JSX.Element {
  return (
    <div class="flex flex-col gap-3">
      <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Figure label="期待値">
          <span class="text-lg font-bold">{yenFigureText(props.summary.meanYen)}</span>
          <Show when={props.summary.marginYen} keyed>
            {(margin) => <span class="ml-1 text-xs text-text-muted">±¥{formatCount(Math.round(margin))}</span>}
          </Show>
        </Figure>
        <Figure label="勝率">{percentText(props.summary.winRate)}</Figure>
        <Figure label="遊タイム到達">{percentText(props.summary.reliefDriveRate)}</Figure>
        <Figure label="平均投資">{props.summary.meanSpins === null ? "--" : `${formatCount(Math.round(props.summary.meanSpins))}回転`}</Figure>
        <Figure label="最大負け">{yenFigureText(props.summary.minYen)}</Figure>
        <Figure label="最大勝ち">{yenFigureText(props.summary.maxYen)}</Figure>
      </dl>
      <Histogram buckets={props.summary.histogram} />
      <p class="text-xs text-text-muted">
        {formatCount(props.summary.trials)}回の試行から。
        {props.summary.marginYen === null ? "試行が少なく、期待値の誤差（±）は出せません。" : "±は95%の範囲です。"}
        <Show when={props.summary.truncatedCombos > 0}> 打ち切った連チャン {formatCount(props.summary.truncatedCombos)}回。</Show>
      </p>
    </div>
  )
}

/**
 * 遊タイム狙い from initial spins: sitting down where the cabinet's counter stands,
 * playing until a first jackpot — or the 遊タイム — and its combo are over,
 * and leaving. The exact theoretical value shows at once; the sampled one, with its
 * spread, is run on this device on request, counted as it goes and stoppable.
 * The button is there whether or not there is yet a spin rate and an
 * exchange rate to run at: pressed without them it runs nothing and says so
 * through `onUnready`, for whoever holds those fields to mark them.
 */
export function HyenaHuntRun(props: {
  readonly basis: Basis
  readonly initialSpins: number
  readonly play: PlayDto | undefined
  readonly onUnready: () => void
  /** What stands before the button, on its line: the field its run turns on, where the two belong side by side. */
  readonly leading?: JSX.Element
}): JSX.Element {
  const app = useApp()
  const [trials, setTrials] = createSignal(String(TRIALS_BY_DEFAULT))
  const [seed, setSeed] = createSignal("")
  const [run, setRun] = createSignal<Run>({ type: "idle" })
  const asked = createMemo(
    () => (props.play === undefined ? undefined : { basis: props.basis, spinPerformance: props.play.spinPerformance, ballValue: props.play.ballValue, initialSpins: props.initialSpins }),
    undefined,
    { equals: sameFields },
  )
  const [exact] = createResource(
    asked,
    async (source) => {
      const rows = await hyenaHuntTable(app.services.pachinko, source.basis, { spinPerformance: source.spinPerformance, ballValue: source.ballValue }, [source.initialSpins])
      return rows.ok ? { ok: true as const, value: rows.value[0] } : rows
    },
  )
  const running = (): (Run & { type: "running" }) | undefined => {
    const current = run()
    return current.type === "running" ? current : undefined
  }
  const shown = (): HyenaHuntSummaryDto | undefined => {
    const current = run()
    return current.type === "running" || current.type === "finished" || current.type === "cancelled" ? current.summary : undefined
  }
  /** The margin the trials typed would come to, told from what has been sampled so far; none before a sampling gave one. */
  const expectedMargin = (): number | undefined => {
    const summary = shown()
    return summary === undefined || summary.marginYen === null ? undefined : marginAtTrials({ margin: summary.marginYen, trials: summary.trials }, trialsOf(trials()) ?? TRIALS_BY_DEFAULT)
  }
  const failure = (): EngineFailure | undefined => {
    const current = run()
    return current.type === "failed" ? current.failure : undefined
  }
  onCleanup(() => running()?.handle.cancel())
  /** A sampling belongs to the count and conditions it was run with: when they change, it is stopped and put away. */
  createEffect(
    on(
      () => [props.basis, props.initialSpins, props.play?.spinPerformance, props.play?.ballValue],
      () => {
        running()?.handle.cancel()
        setRun({ type: "idle" })
      },
      { defer: true },
    ),
  )

  const start = (): void => {
    const play = props.play
    if (play === undefined) {
      props.onUnready()
      return
    }
    const planned = trialsOf(trials()) ?? TRIALS_BY_DEFAULT
    const handle = hyenaHuntFrom(app.services.pachinko, props.basis, play, props.initialSpins, { trials: planned, seed: seedOf(seed()) ?? app.services.newSeed() }, (event) => {
      switch (event.type) {
        case "progress":
          return setRun((current) => (current.type === "running" ? { ...current, summary: event.summary } : current))
        case "completed":
          return setRun({ type: "finished", summary: event.summary })
        case "cancelled":
          return setRun({ type: "cancelled", summary: event.summary })
        case "failed":
          return setRun({ type: "failed", failure: event.failure })
      }
    })
    setRun({ type: "running", planned, summary: undefined, handle })
  }

  return (
    <div class="flex flex-col gap-4">
      <Show when={reliefDriveOf(props.basis) === undefined}>
        <p class="text-xs text-text-muted">この機種には遊タイムがありません。どこから打っても期待値は同じです。</p>
      </Show>
      <div class="flex flex-wrap items-end gap-2">
        {props.leading}
        <Switch
          fallback={
            <div class="flex items-center gap-1">
              <Button variant="secondary" onClick={start}>
                シミュレーション
              </Button>
              <HelpPopover label="遊タイム狙いのシミュレーションについて" title="遊タイム狙いのシミュレーションについて" semipro>
                <p>
                  この端末で、{formatCount(props.initialSpins)}回転から座って、初当り（遊タイムの当たりも含む）の連チャンが終わったらやめる、を1回として{formatMan(trialsOf(trials()) ?? TRIALS_BY_DEFAULT)}回くり返します。
                  <Show when={expectedMargin()} keyed fallback="回数が多いほど、期待値の誤差（±）は小さくなります。">
                    {(margin) => <>いまの結果からすると、この回数なら期待値の誤差（95%の範囲）は ±¥{formatCount(Math.round(margin))} ほどです。</>}
                  </Show>
                </p>
                <p>上の期待値は計算エンジンが厳密に解いた値で、シミュレーションは勝率や収支のばらつきを見るためのものです。</p>
                <div class="grid grid-cols-2 gap-2">
                  <TextField label="試行回数" value={trials()} onChange={setTrials} inputMode="numeric" suffix="回" error={trialsOf(trials()) === undefined ? "1〜10億回" : undefined} />
                  <TextField label="シード" value={seed()} onChange={setSeed} inputMode="numeric" placeholder="毎回ちがう" error={seed().trim() === "" || seedOf(seed()) !== undefined ? undefined : "整数"} />
                </div>
                <p class="text-xs text-text-muted">ここで変えた値は、この画面を離れるまでのあいだだけ使われます。</p>
              </HelpPopover>
            </div>
          }
        >
          <Match when={running()} keyed>
            {(current) => (
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <progress class="h-2 flex-1 accent-accent" max={current.planned} value={current.summary?.trials ?? 0} />
                <span class="shrink-0 text-sm tabular-nums text-text-secondary">
                  {formatMan(current.summary?.trials ?? 0)}回目 / {formatMan(current.planned)}回
                </span>
                <Button variant="secondary" size="small" onClick={() => current.handle.cancel()}>
                  中止
                </Button>
              </div>
            )}
          </Match>
        </Switch>
      </div>
      <Show when={props.play !== undefined}>
        <Loaded outcome={exact()}>
          {(row) => (
            <Show when={row} keyed>
              {(found) => (
                <p class="text-sm text-text-secondary">
                  {formatCount(props.initialSpins)}回転から打つと 期待値 <span class="font-bold tabular-nums text-text-primary">{yenFigureText(found.yen)}</span>
                  <span class="text-xs text-text-muted">（遊タイム到達 {percentText(found.reliefDriveProbability)}・平均投資 {formatCount(Math.round(found.spins))}回転）</span>
                </p>
              )}
            </Show>
          )}
        </Loaded>
      </Show>
      <Show when={run().type === "cancelled"}>
        <p class="text-sm text-text-muted">中止しました。ここまでの結果です。</p>
      </Show>
      <Show when={failure()} keyed>
        {(failed) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
            {describeEngineFailure(failed)}
          </div>
        )}
      </Show>
      <Show when={shown()} keyed>
        {(summary) => <Sampled summary={summary} />}
      </Show>
    </div>
  )
}
