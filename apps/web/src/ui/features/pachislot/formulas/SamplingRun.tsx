import type { EstimateSummaryDto } from "@p-lens/contracts/pachislot"
import { createSignal, Index, Match, onCleanup, Show, Switch, type JSX } from "solid-js"

import { sampleBasis } from "../../../../application/pachislot/formulas"
import { marginAtTrials } from "../../../../core/sampling/margin"
import type { Basis } from "../../../../core/pachislot/formula"
import type { RunningRun } from "../../../../pachislot-engine/client/client"
import type { EngineFailure } from "../../../../pachislot-engine/protocol/messages"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { HelpPopover } from "../../../primitives/popover"
import { TextField } from "../../../primitives/text-field"
import { formatCount, formatMan } from "../../../wording/numbers"
import { payoutRateText } from "../../../wording/pachislot/formula"
import { describeEngineFailure } from "../../../wording/pachislot/engine"
import { gamesOf, GAMES_BY_DEFAULT, seedOf } from "./sampling-settings"

/** Where a sampling is. A finished or stopped one keeps what it had come to. */
type Run =
  | { readonly type: "idle" }
  | { readonly type: "running"; readonly planned: number; readonly summary: EstimateSummaryDto | undefined; readonly handle: RunningRun }
  | { readonly type: "finished"; readonly summary: EstimateSummaryDto }
  | { readonly type: "cancelled"; readonly summary: EstimateSummaryDto | undefined }
  | { readonly type: "failed"; readonly failure: EngineFailure }

/** The games every setting level has been sampled for so far: the planned number once a sampling finishes. */
const fewestGames = (summary: EstimateSummaryDto): number => Math.min(...summary.settingLevels.map((each) => each.games))

/** The widest of the setting levels' margins: none while any level has none yet. */
const widestMargin = (summary: EstimateSummaryDto): number | undefined => {
  const margins = summary.settingLevels.map((each) => each.payoutRateMargin)
  return margins.length === 0 || margins.some((margin) => margin === null) ? undefined : Math.max(...margins.map((margin) => margin ?? 0))
}

function Estimates(props: { readonly summary: EstimateSummaryDto }): JSX.Element {
  return (
    <ul class="grid grid-cols-2 gap-2 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm tabular-nums sm:grid-cols-3">
      <Index each={props.summary.settingLevels}>
        {(each) => (
          <li>
            <span class="text-xs text-text-muted">設定{each().settingLevel}</span>
            <span class="ml-2 font-bold text-text-primary">{each().payoutRate === null ? "--" : payoutRateText(each().payoutRate ?? 0)}</span>
            <Show when={each().payoutRateMargin} keyed>
              {(margin) => <span class="ml-1 text-xs text-text-muted">±{(margin * 100).toFixed(2)}</span>}
            </Show>
          </li>
        )}
      </Index>
    </ul>
  )
}

/**
 * Sampling a 解析値's 機械割 on this device, to set beside what the engine
 * worked out of them: so many regular games for each setting level from a
 * seed, a chunk at a time in the engine's worker, counted as it goes and
 * stoppable. It is a check and makes nothing: a formula keeps the exact
 * 機械割, of which these are estimates.
 */
export function SamplingRun(props: { readonly basis: Basis; readonly settingLevels: number }): JSX.Element {
  const app = useApp()
  const [games, setGames] = createSignal(String(GAMES_BY_DEFAULT))
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
  /** The widest margin the games typed would come to, told from what has been sampled so far; none before a sampling gave one. */
  const expectedMargin = (): number | undefined => {
    const summary = shown()
    const margin = summary === undefined ? undefined : widestMargin(summary)
    return summary === undefined || margin === undefined ? undefined : marginAtTrials({ margin, trials: fewestGames(summary) }, gamesOf(games()) ?? GAMES_BY_DEFAULT)
  }
  const failure = (): EngineFailure | undefined => {
    const current = run()
    return current.type === "failed" ? current.failure : undefined
  }
  const done = (summary: EstimateSummaryDto | undefined): number => summary?.settingLevels.reduce((sum, each) => sum + each.games, 0) ?? 0
  onCleanup(() => running()?.handle.cancel())

  const start = (): void => {
    const sampling = { gamesPerSettingLevel: gamesOf(games()) ?? GAMES_BY_DEFAULT, seed: seedOf(seed()) ?? app.services.newSeed() }
    const handle = sampleBasis(app.services.pachislot, props.basis, sampling, (event) => {
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
    setRun({ type: "running", planned: sampling.gamesPerSettingLevel * props.settingLevels, summary: undefined, handle })
  }

  return (
    <div class="flex flex-col gap-4">
      <Switch
        fallback={
          <div class="flex items-center gap-1">
            <Button variant="semipro" onClick={start}>シミュレーション開始</Button>
            <HelpPopover label="シミュレーションについて" title="シミュレーションについて" semipro>
              <p>この端末で、設定ごとに通常時を{formatMan(gamesOf(games()) ?? GAMES_BY_DEFAULT)}ゲームずつ回して、機械割を推定します。
                <Show when={expectedMargin()} keyed fallback="ゲーム数が多いほど、結果の誤差（±）は小さくなります。">
                  {(margin) => <>いまの結果からすると、このゲーム数なら機械割の誤差（95%の範囲）は最大で ±{(margin * 100).toFixed(2)} ほどです。</>}
                </Show>
              </p>
              <p>同じシードなら、誰が回しても同じ結果になります。結果は確認用で、算出条件にはなりません。</p>
              <div class="grid grid-cols-2 gap-2">
                <TextField label="設定ごとのゲーム数" value={games()} onChange={setGames} inputMode="numeric" suffix="G" error={gamesOf(games()) === undefined ? "1〜10億G" : undefined} />
                <TextField label="シード" value={seed()} onChange={setSeed} inputMode="numeric" error={seedOf(seed()) === undefined ? "整数" : undefined} />
              </div>
              <p class="text-xs text-text-muted">ここで変えた値は、この画面を離れるまでのあいだだけ使われます。</p>
            </HelpPopover>
          </div>
        }
      >
        <Match when={running()}>
          {(current) => (
            <div class="flex items-center gap-3">
              <progress class="h-2 flex-1 accent-accent" max={current().planned} value={done(current().summary)} />
              <span class="shrink-0 text-sm tabular-nums text-text-secondary">
                {formatMan(done(current().summary))}G / {formatMan(current().planned)}G
              </span>
              <Button variant="secondary" size="small" onClick={() => current().handle.cancel()}>
                中止
              </Button>
            </div>
          )}
        </Match>
      </Switch>
      <Show when={run().type === "cancelled"}>
        <p class="text-sm text-text-muted">中止しました。</p>
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
            <Estimates summary={summary} />
            <p class="text-xs text-text-muted">
              設定ごとに {formatCount(fewestGames(summary))}G の試行から推定。{widestMargin(summary) === undefined ? "試行が少なく、誤差（±）は出せません。" : "±は95%の範囲です。"}
            </p>
          </div>
        )}
      </Show>
    </div>
  )
}
