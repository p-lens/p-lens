import type { ConditionsDto, NormalizedSpecDto, PlayDto, SummaryDto } from "@p-lens/contracts/pachinko"
import { createSignal, For, Match, onCleanup, Show, Switch, type JSX } from "solid-js"

import type { RunningRun } from "../../../../pachinko-engine/client/client"
import type { EngineFailure } from "../../../../pachinko-engine/protocol/messages"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { describeEngineFailure } from "../../../wording/pachinko/engine"
import { amountText, formatMan, yenFigureText } from "../../../wording/numbers"
import { Histogram } from "./Histogram"
import { seal } from "../../../../mummer"

/** Where a run is. A finished, cancelled or failed run keeps what it had come to. */
type Run =
  | { readonly type: "idle" }
  | { readonly type: "running"; readonly planned: number; readonly summary: SummaryDto | undefined; readonly handle: RunningRun }
  | { readonly type: "finished"; readonly summary: SummaryDto }
  | { readonly type: "cancelled"; readonly summary: SummaryDto | undefined }
  | { readonly type: "failed"; readonly failure: EngineFailure }

/** How many sessions a simulation may be set to run: enough to show a spread, a spread worth trusting, and all a patient person will wait for. */
const SESSION_PRESETS = [1_000_000, 10_000_000, 100_000_000] as const

/** How many sessions a simulation runs unless another is chosen. */
const SESSIONS_BY_DEFAULT = 10_000_000

function Results(props: { readonly summary: SummaryDto; readonly exactRounds: number }): JSX.Element {
  return (
    <div class="flex flex-col gap-3">
      <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div><dt class="text-xs text-text-muted">試行</dt><dd class="tabular-nums">{formatMan(props.summary.sessions)} / {formatMan(props.summary.planned)}</dd></div>
        <div><dt class="text-xs text-text-muted">平均収支</dt><dd class="tabular-nums">{yenFigureText(seal.formula(props.summary.meanYen))}</dd></div>
        <div><dt class="text-xs text-text-muted">標準偏差</dt><dd class="tabular-nums">{props.summary.standardDeviationYen === null ? "--" : `¥${amountText(seal.formula(Math.round(props.summary.standardDeviationYen)))}`}</dd></div>
        <div><dt class="text-xs text-text-muted">勝率</dt><dd class="tabular-nums">{props.summary.winRate === null ? "--" : `${(props.summary.winRate * 100).toFixed(1)}%`}</dd></div>
        <div><dt class="text-xs text-text-muted">最大負け</dt><dd class="tabular-nums">{yenFigureText(seal.formula(props.summary.minYen))}</dd></div>
        <div><dt class="text-xs text-text-muted">最大勝ち</dt><dd class="tabular-nums">{yenFigureText(seal.formula(props.summary.maxYen))}</dd></div>
      </dl>
      <Histogram buckets={props.summary.histogram} />
      <p class="text-xs text-text-muted">
        検算: 初当り1回あたり {props.summary.roundsPerFirstHit === null ? "--" : `${props.summary.roundsPerFirstHit.toFixed(2)}R`}（理論値 {props.exactRounds.toFixed(2)}R）
        <Show when={props.summary.truncatedCombos > 0}> ／ 打ち切った連チャン {props.summary.truncatedCombos}回</Show>
      </p>
    </div>
  )
}

/**
 * The spread of play under the person's conditions, sampled in the engine's
 * worker. Never the theoretical value — that is the exact figure above; this is
 * how far from it a session can land. Its button is there before there are
 * conditions to run under: pressed then it runs nothing and says so through
 * `onUnready`, for whoever holds the conditions' fields to mark them.
 */
export function SimulationPanel(props: {
  readonly normalized: NormalizedSpecDto
  readonly conditions: ConditionsDto
  readonly play: PlayDto | undefined
  readonly exactRounds: number
  readonly onUnready: () => void
}): JSX.Element {
  const app = useApp()
  const [sessions, setSessions] = createSignal<number>(SESSIONS_BY_DEFAULT)
  const [spins, setSpins] = createSignal("3000")
  const [seed, setSeed] = createSignal(app.services.newSeed())
  const [run, setRun] = createSignal<Run>({ type: "idle" })
  const running = (): (Run & { type: "running" }) | undefined => {
    const current = run()
    return current.type === "running" ? current : undefined
  }
  const finished = (): SummaryDto | undefined => {
    const current = run()
    return current.type === "finished" ? current.summary : undefined
  }
  const cancelled = (): (Run & { type: "cancelled" }) | undefined => {
    const current = run()
    return current.type === "cancelled" ? current : undefined
  }
  const failure = (): EngineFailure | undefined => {
    const current = run()
    return current.type === "failed" ? current.failure : undefined
  }
  onCleanup(() => running()?.handle.cancel())

  const start = (play: PlayDto): void => {
    const spinsPerSession = Number(spins())
    if (!Number.isInteger(spinsPerSession) || spinsPerSession <= 0) return
    const handle = app.services.pachinko.simulate(
      {
        source: { type: "normalized", normalized: props.normalized },
        conditions: props.conditions,
        play,
        plan: { sessions: sessions(), spinsPerSession },
        seed: seed(),
      },
      (event) => {
        switch (event.type) {
          case "started":
            return setRun({ type: "running", planned: event.planned, summary: undefined, handle })
          case "progress":
            return setRun((current) => (current.type === "running" ? { ...current, summary: event.summary } : current))
          case "completed":
            return setRun({ type: "finished", summary: event.summary })
          case "cancelled":
            return setRun({ type: "cancelled", summary: event.summary })
          case "failed":
            return setRun({ type: "failed", failure: event.failure })
        }
      },
    )
    setRun({ type: "running", planned: sessions(), summary: undefined, handle })
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">試行回数</span>
          <ToggleGroup
            value={String(sessions())}
            onChange={(value: string | null) => {
              if (value !== null) setSessions(Number(value))
            }}
            aria-label="試行回数"
          >
            <For each={SESSION_PRESETS}>{(count) => <ToggleGroupItem value={String(count)} class="data-[pressed]:text-semipro-ink">{formatMan(count)}回</ToggleGroupItem>}</For>
          </ToggleGroup>
        </div>
        <div class="w-36">
          <TextField label="1回の回転数" value={spins()} onChange={setSpins} inputMode="numeric" suffix="回転" />
        </div>
        <div class="w-56">
          <TextField label="シード" value={seed()} onChange={setSeed} inputMode="numeric" />
        </div>
      </div>
      <Switch>
        <Match when={props.play === undefined}>
          <div class="flex flex-col gap-3">
            <div>
              <Button variant="secondary" onClick={() => props.onUnready()}>シミュレーション開始</Button>
            </div>
            <p class="text-sm text-text-muted">回転率と交換率を入れると、その条件でシミュレーションできます。</p>
          </div>
        </Match>
        <Match when={running()}>
          {(current) => (
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-3">
                <progress class="h-2 flex-1 accent-accent" max={current().planned} value={current().summary?.sessions ?? 0} />
                <span class="shrink-0 text-sm tabular-nums text-text-secondary">
                  {formatMan(current().summary?.sessions ?? 0)}回目 / {formatMan(current().planned)}回
                </span>
                <Button variant="secondary" size="small" onClick={() => current().handle.cancel()}>
                  中止
                </Button>
              </div>
              <Show when={current().summary} keyed>
                {(summary) => <Results summary={summary} exactRounds={props.exactRounds} />}
              </Show>
            </div>
          )}
        </Match>
        <Match when={props.play} keyed>
          {(play) => (
            <div class="flex flex-col gap-3">
              <div>
                <Button variant="secondary" onClick={() => start(play)}>シミュレーション開始</Button>
              </div>
              <Switch>
                <Match when={finished()} keyed>
                  {(summary) => <Results summary={summary} exactRounds={props.exactRounds} />}
                </Match>
                <Match when={cancelled()} keyed>
                  {(stopped) => (
                    <>
                      <p class="text-sm text-text-muted">中止しました。ここまでの結果です。</p>
                      <Show when={stopped.summary} keyed>
                        {(summary) => <Results summary={summary} exactRounds={props.exactRounds} />}
                      </Show>
                    </>
                  )}
                </Match>
                <Match when={failure()} keyed>
                  {(failed) => (
                    <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
                      {describeEngineFailure(failed)}
                    </div>
                  )}
                </Match>
              </Switch>
            </div>
          )}
        </Match>
      </Switch>
    </div>
  )
}
