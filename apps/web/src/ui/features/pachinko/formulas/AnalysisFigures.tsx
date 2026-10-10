import type { AnalysisDto } from "@p-lens/contracts/pachinko"
import { For, Show, type JSX } from "solid-js"

import { formatCount } from "../../../wording/numbers"
import { oneInText, payoutText } from "../../../wording/pachinko/formula"

function Tile(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <dt class="text-xs font-bold uppercase tracking-wide text-text-muted">{props.label}</dt>
      <dd class="text-xl font-bold tabular-nums text-text-primary">{props.value}</dd>
    </div>
  )
}

/**
 * The 計算根拠: the exact figures the engine solved from a basis, and how each
 * state of the combo contributed to them — traceable, not a black box.
 */
export function AnalysisFigures(props: { readonly analysis: AnalysisDto; readonly labels: ReadonlyMap<string, string> }): JSX.Element {
  const label = (mode: string): string => props.labels.get(mode) ?? mode
  /** The mode the 遊タイム leads to: entered from regular play, never from a first jackpot, so its entry from one says nothing. */
  const reliefDriveMode = (): string | undefined => {
    const target = props.analysis.normalized.reliefDrive?.target
    return target?.type === "state" ? props.analysis.normalized.origins[target.index]?.mode : undefined
  }
  return (
    <div class="flex flex-col gap-3">
      <dl class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Tile label="平均R" value={`${props.analysis.averageRounds.toFixed(2)}R`} />
        <Tile label="平均出玉" value={`${formatCount(Math.round(props.analysis.averagePayout))}玉`} />
        <Tile label="平均連チャン" value={`${props.analysis.averageCombo.toFixed(2)}回`} />
        <Tile label="トータル確率" value={oneInText(props.analysis.totalChanceOneIn)} />
        <Tile label="1Rトータル確率" value={oneInText(props.analysis.roundChanceOneIn)} />
        <Show when={props.analysis.reliefDrive} keyed>
          {(reliefDrive) => <Tile label="遊タイム到達率" value={`${(reliefDrive.reachProbability * 100).toFixed(2)}%`} />}
        </Show>
        <For each={props.analysis.modeEntry.filter((entry) => entry.mode !== reliefDriveMode())}>
          {(entry) => <Tile label={`${label(entry.mode)} 突入率`} value={`${(entry.probability * 100).toFixed(2)}%`} />}
        </For>
      </dl>
      <section class="text-sm text-text-secondary">
        <h3 class="text-xs font-bold uppercase tracking-wide text-text-muted">状態ごとの寄与</h3>
        <table class="mt-2 w-full tabular-nums">
          <thead>
            <tr class="text-left text-xs text-text-muted">
              <th class="py-1 font-normal">状態</th>
              <th class="py-1 font-normal">ここからの平均R</th>
              <th class="py-1 font-normal">ここからの平均当り</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.analysis.derivation}>
              {(state) => (
                <tr class="border-t border-border">
                  <td class="py-1">
                    {label(state.mode)}
                    {state.combo > 1 ? `（${state.combo}連目）` : ""}
                  </td>
                  <td class="py-1">{state.averageRounds.toFixed(2)}R</td>
                  <td class="py-1">{state.averageCombo.toFixed(2)}回</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-text-muted">
          計算エンジン v{props.analysis.engineVersion} ／ スキーマ v{props.analysis.schemaVersion} ／ 1R {payoutText(props.analysis.ballsPerRound)}
        </p>
      </section>
    </div>
  )
}
