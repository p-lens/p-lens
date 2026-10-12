import type { EstimateSummaryDto } from "@p-lens/contracts/pachinko"
import { createSignal, Match, onCleanup, Show, Switch, type JSX } from "solid-js"

import { sampleBasis } from "../../../../application/pachinko/formulas"
import { figuresFromEstimate } from "../../../../core/pachinko/figures"
import { marginAtTrials } from "../../../../core/sampling/margin"
import type { Basis, Sampling } from "../../../../core/pachinko/formula"
import type { Figures } from "../../../../core/pachinko/figures"
import type { RunningRun } from "../../../../pachinko-engine/client/client"
import type { EngineFailure } from "../../../../pachinko-engine/protocol/messages"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { redRing } from "../../../primitives/nudge"
import { HelpPopover } from "../../../primitives/popover"
import { TextField } from "../../../primitives/text-field"
import { describeEngineFailure } from "../../../wording/pachinko/engine"
import { oneInText, payoutText } from "../../../wording/pachinko/formula"
import { formatCount, formatMan } from "../../../wording/numbers"

import { seedOf, trialsOf, TRIALS_BY_DEFAULT } from "./sampling-settings"

/** Where a sampling is. A finished or stopped one keeps what it had come to. */
type Run =
  | { readonly type: "idle" }
  | { readonly type: "running"; readonly planned: number; readonly summary: EstimateSummaryDto | undefined; readonly handle: RunningRun }
  | { readonly type: "finished"; readonly summary: EstimateSummaryDto; readonly seed: string }
  | { readonly type: "cancelled"; readonly summary: EstimateSummaryDto | undefined }
  | { readonly type: "failed"; readonly failure: EngineFailure }


/** A sampled formula as it would be kept: its figures, and how they were sampled. */
export interface Sampled {
  readonly figures: Figures
  readonly sampling: Sampling
}

const sampledFrom = (summary: EstimateSummaryDto, seed: string, spinsPerHour: number | undefined): Sampled | undefined => {
  const figures = figuresFromEstimate(summary, spinsPerHour)
  return figures === undefined || summary.roundChanceMargin === null
    ? undefined
    : { figures, sampling: { cycles: summary.cycles, seed, roundChanceMargin: summary.roundChanceMargin } }
}

function Estimate(props: { readonly summary: EstimateSummaryDto }): JSX.Element {
  return (
    <dl class="grid grid-cols-2 gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
      <div>
        <dt class="text-xs text-text-muted">1Rトータル確率</dt>
        <dd class="text-lg font-bold tabular-nums">
          {props.summary.roundChanceOneIn === null ? "--" : oneInText(props.summary.roundChanceOneIn)}
          <Show when={props.summary.roundChanceMargin} keyed>
            {(margin) => <span class="ml-1 text-xs font-normal text-text-muted">±{margin.toFixed(2)}</span>}
          </Show>
        </dd>
      </div>
      <div>
        <dt class="text-xs text-text-muted">1R平均出玉</dt>
        <dd class="text-lg font-bold tabular-nums">{payoutText(props.summary.payoutPerRound)}</dd>
      </div>
    </dl>
  )
}

/**
 * Sampling a basis on this device: so many cycles from a seed, a chunk at a
 * time in the engine's worker, counted as it goes and stoppable. A finished
 * sampling is handed up as the formula it would make; anything else hands up
 * none, so nothing half-sampled is ever saved.
 */
export function SamplingRun(props: {
  readonly basis: Basis
  readonly spinsPerHour: number | undefined
  readonly onSampled: (sampled: Sampled | undefined) => void
  /** A save was pressed before a sampling finished: the way to start one turns red. */
  readonly nudged: boolean
}): JSX.Element {
  const app = useApp()
  const [cycles, setCycles] = createSignal(String(TRIALS_BY_DEFAULT))
  const [seed, setSeed] = createSignal(app.services.newSeed())
  const [run, setRun] = createSignal<Run>({ type: "idle" })
  const running = (): (Run & { type: "running" }) | undefined => {
    const current = run()
    return current.type === "running" ? current : undefined
  }
  const shown = (): EstimateSummaryDto | undefined => {
    const current = run()
    return current.type === "running" || current.type === "finished" || current.type === "cancelled" ? current.summary : undefined
  }
  /** The margin the trials typed would come to, told from what has been sampled so far; none before a sampling gave one. */
  const expectedMargin = (): number | undefined => {
    const summary = shown()
    return summary === undefined || summary.roundChanceMargin === null ? undefined : marginAtTrials({ margin: summary.roundChanceMargin, trials: summary.cycles }, trialsOf(cycles()) ?? TRIALS_BY_DEFAULT)
  }
  const failure = (): EngineFailure | undefined => {
    const current = run()
    return current.type === "failed" ? current.failure : undefined
  }
  onCleanup(() => running()?.handle.cancel())

  const settle = (next: Run): void => {
    setRun(next)
    props.onSampled(next.type === "finished" ? sampledFrom(next.summary, next.seed, props.spinsPerHour) : undefined)
  }

  const start = (): void => {
    const sampling = { cycles: trialsOf(cycles()) ?? TRIALS_BY_DEFAULT, seed: seedOf(seed()) ?? app.services.newSeed() }
    props.onSampled(undefined)
    const handle = sampleBasis(app.services.pachinko, props.basis, sampling, (event) => {
      switch (event.type) {
        case "progress":
          return setRun((current) => (current.type === "running" ? { ...current, summary: event.summary } : current))
        case "completed":
          return settle({ type: "finished", summary: event.summary, seed: sampling.seed })
        case "cancelled":
          return settle({ type: "cancelled", summary: event.summary })
        case "failed":
          return settle({ type: "failed", failure: event.failure })
      }
    })
    setRun({ type: "running", planned: sampling.cycles, summary: undefined, handle })
  }

  return (
    <div class="flex flex-col gap-4">
      <Switch
        fallback={
          <div class="flex items-center gap-1">
            <span class="inline-flex rounded-[3px]" classList={redRing(props.nudged)}>
              <Button variant="semipro" onClick={start}>シミュレーション開始</Button>
            </span>
            <HelpPopover label="シミュレーションについて" title="シミュレーションについて" semipro>
              <p>
                この端末で、通常時から初当りを引いてその連チャンが終わるまでを1回として、{formatMan(trialsOf(cycles()) ?? TRIALS_BY_DEFAULT)}回くり返します。
                <Show when={expectedMargin()} keyed fallback="回数が多いほど、結果の誤差（±）は小さくなります。">
                  {(margin) => <>いまの結果からすると、この回数なら1Rトータル確率の誤差（95%の範囲）は ±{margin.toFixed(2)} ほどです。</>}
                </Show>
              </p>
              <p>同じシードなら、誰が回しても同じ結果になります。シードは算出条件と一緒に保存されます。</p>
              <div class="grid grid-cols-2 gap-2">
                <TextField label="試行回数" value={cycles()} onChange={setCycles} inputMode="numeric" suffix="回" error={trialsOf(cycles()) === undefined ? "1〜10億回" : undefined} />
                <TextField label="シード" value={seed()} onChange={setSeed} inputMode="numeric" error={seedOf(seed()) === undefined ? "整数" : undefined} />
              </div>
              <p class="text-xs text-text-muted">ここで変えた値は、この画面を離れるまでのあいだだけ使われます。</p>
            </HelpPopover>
          </div>
        }
      >
        <Match when={running()} keyed>
          {(current) => (
            <div class="flex items-center gap-3">
              <progress class="h-2 flex-1 accent-accent" max={current.planned} value={current.summary?.cycles ?? 0} />
              <span class="shrink-0 text-sm tabular-nums text-text-secondary">
                {formatMan(current.summary?.cycles ?? 0)}回目 / {formatMan(current.planned)}回
              </span>
              <Button variant="secondary" size="small" onClick={() => current.handle.cancel()}>
                中止
              </Button>
            </div>
          )}
        </Match>
      </Switch>
      <Show when={run().type === "cancelled"}>
        <p class="text-sm text-text-muted">中止しました。最後まで回した結果だけが算出条件になります。</p>
      </Show>
      <Show when={failure()} keyed>
        {(failed) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
            {describeEngineFailure(failed)}
          </div>
        )}
      </Show>
      <Show when={shown()} keyed>
        {(summary) => (
          <div class="flex flex-col gap-2">
            <Estimate summary={summary} />
            <p class="text-xs text-text-muted">
              {formatCount(summary.cycles)}回の試行から推定。{summary.roundChanceMargin === null ? "試行が少なく、誤差（±）は出せません。" : "±は95%の範囲です。"}
              <Show when={summary.truncatedCombos > 0}> 打ち切った連チャン {formatCount(summary.truncatedCombos)}回。</Show>
            </p>
          </div>
        )}
      </Show>
    </div>
  )
}
