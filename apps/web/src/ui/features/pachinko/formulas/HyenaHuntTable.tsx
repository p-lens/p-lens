import type { PlayDto } from "@p-lens/contracts/pachinko"
import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"

import { hyenaHuntTable, tableInitialSpins } from "../../../../application/pachinko/hyena-hunt"
import type { Basis } from "../../../../core/pachinko/formula"
import { tidyTyped } from "../../../../core/text/tidy"
import { useApp } from "../../../context"
import { createNudge } from "../../../primitives/nudge"
import { Loaded } from "../../../primitives/states"
import { TextField } from "../../../primitives/text-field"
import { formatCount, theoreticalFigureText } from "../../../wording/numbers"
import { useStartBallValue } from "../../live/start-form"
import { HyenaHuntRun } from "./HyenaHuntRun"
import { seal } from "../../../../mummer"

const positiveOf = (text: string): number | undefined => {
  const value = Number(tidyTyped(text))
  return tidyTyped(text) !== "" && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * 遊タイム狙い at every count, for a machine with a 遊タイム: what sitting down at
 * each comes to on average, solved exactly, so where hyena hunting starts to pay
 * shows at a glance. Choosing a row samples that count on this device;
 * the button to is there from the first, and marks the rates it lacks.
 */
export function HyenaHuntTable(props: { readonly basis: Basis; readonly reliefDrive: number }): JSX.Element {
  const app = useApp()
  const startBallValue = useStartBallValue()
  const [rate, setRate] = createSignal("")
  const [value, setValue] = createSignal("")
  const [chosen, setChosen] = createSignal<number | undefined>(undefined)
  const unready = createNudge()
  const exchange = (): number | undefined => positiveOf(value()) ?? startBallValue()
  const play = createMemo((): PlayDto | undefined => {
    const spins = positiveOf(rate())
    const ballValue = exchange()
    return spins === undefined || ballValue === undefined ? undefined : { spinPerformance: spins, ballValue }
  })
  const [rows] = createResource(
    () => play(),
    (conditions) => hyenaHuntTable(app.services.pachinko, props.basis, conditions, tableInitialSpins(props.reliefDrive)),
  )
  return (
    <section class="flex flex-col gap-3" aria-label="遊タイム狙い">
      <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">遊タイム狙い（{formatCount(props.reliefDrive)}回転で発動）</h2>
      <div class="grid max-w-sm grid-cols-2 gap-3">
        <TextField label="回転率" value={rate()} onChange={setRate} inputMode="decimal" suffix="回/千円" invalid={unready.red() && positiveOf(rate()) === undefined} onFocus={unready.settle} />
        <TextField
          label="交換率"
          value={value()}
          onChange={setValue}
          inputMode="decimal"
          suffix="円/玉"
          placeholder={startBallValue() === undefined ? "4" : String(startBallValue())}
          invalid={unready.red() && exchange() === undefined}
          onFocus={unready.settle}
        />
      </div>
      <Show when={play()} fallback={<p class="text-xs text-text-muted">回転率と交換率を入れると、何回転から打てばいくらになるかの表が出ます。</p>}>
        <Loaded outcome={rows()}>
          {(found) => (
            <table class="w-full max-w-xl text-sm tabular-nums">
              <thead>
                <tr class="text-left text-xs text-text-muted">
                  <th class="py-1 font-normal">打ち始め</th>
                  <th class="py-1 text-right font-normal">期待値</th>
                  <th class="py-1 text-right font-normal">遊タイム到達</th>
                  <th class="py-1 text-right font-normal">平均投資</th>
                </tr>
              </thead>
              <tbody>
                <For each={found}>
                  {(row) => (
                    <tr class="border-t border-border hover:bg-surface-3/60" classList={{ "bg-accent/10": chosen() === row.initialSpins }}>
                      <td class="py-1.5">
                        <button type="button" class="text-accent hover:underline" aria-pressed={chosen() === row.initialSpins} onClick={() => setChosen(row.initialSpins)}>
                          {formatCount(row.initialSpins)}回転
                        </button>
                      </td>
                      <td class="py-1.5 text-right font-semibold">
                        {theoreticalFigureText(seal.formula(row.yen))}
                      </td>
                      <td class="py-1.5 text-right">{(row.reliefDriveProbability * 100).toFixed(1)}%</td>
                      <td class="py-1.5 text-right">{formatCount(Math.round(row.spins))}回転</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          )}
        </Loaded>
        <p class="text-xs text-text-muted">打ち始めの回転数を選ぶと、そこからシミュレーションします。選ばなければ0回転からです。</p>
      </Show>
      <HyenaHuntRun basis={props.basis} initialSpins={chosen() ?? 0} play={play()} onUnready={unready.nudge} />
    </section>
  )
}
