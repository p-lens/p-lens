import type { PlayDto } from "@p-lens/contracts/pachinko"
import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"

import { hyenaHuntTable, tableInitialSpins } from "../../../../application/pachinko/hyena-hunt"
import type { Figures } from "../../../../core/pachinko/figures"
import type { Basis } from "../../../../core/pachinko/formula"
import { assumedHuntPerformance, firstGainingRow } from "../../../../core/pachinko/hyena-hunt"
import { tokensRentedFor, tokenValueOf } from "../../../../core/parlor/terms"
import { tidyTyped } from "../../../../core/text/tidy"
import { useApp } from "../../../context"
import { bringIntoView } from "../../../primitives/bring-into-view"
import { createNudge } from "../../../primitives/nudge"
import { Loaded } from "../../../primitives/states"
import { TextField } from "../../../primitives/text-field"
import { formatCount, theoreticalFigureText } from "../../../wording/numbers"
import { useStartPachinkoTerms } from "../../live/start-form"
import { HyenaHuntRun } from "./HyenaHuntRun"
import { seal } from "../../../../mummer"

/** The corner a table is first reckoned at where the start form says nothing: 250 balls to ¥1,000, exchanging at 28 to ¥100, as the 期待値算出 sheet's. */
const USUAL_CORNER = { rentedPerThousand: 250, ballValue: 100 / 28 } as const

const positiveOf = (text: string): number | undefined => {
  const value = Number(tidyTyped(text))
  return tidyTyped(text) !== "" && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * 遊タイム狙い at every count, for a machine with a 遊タイム: what sitting down at
 * each comes to on average, solved exactly, so where hyena hunting starts to pay
 * shows at a glance. It is reckoned from the first, on the start form's
 * corner or the usual one, at a spin rate a little under the own-ball
 * border while none is typed; and the first row that gains stands chosen
 * until another is. Choosing a row samples that count on this device;
 * the button to is there from the first, and marks the rates it lacks.
 * `brought` is a place asking for the table: that row is brought to the
 * middle of the view once it is reckoned, or the table where none gains.
 */
export function HyenaHuntTable(props: { readonly basis: Basis; readonly figures: Figures; readonly reliefDrive: number; readonly brought: boolean }): JSX.Element {
  const app = useApp()
  const startTerms = useStartPachinkoTerms()
  const [rate, setRate] = createSignal("")
  const [value, setValue] = createSignal("")
  const [chosen, setChosen] = createSignal<number | undefined>(undefined)
  const unready = createNudge()
  const startBallValue = (): number => ((terms) => (terms === undefined ? USUAL_CORNER.ballValue : tokenValueOf(terms)))(startTerms())
  const assumedRate = createMemo((): number => ((terms) => assumedHuntPerformance(props.figures, terms === undefined ? USUAL_CORNER.rentedPerThousand : tokensRentedFor(terms, 1000)))(startTerms()))
  const typedOr = (text: string, assumed: number): number | undefined => (tidyTyped(text) === "" ? assumed : positiveOf(text))
  const exchange = (): number | undefined => typedOr(value(), startBallValue())
  const play = createMemo((): PlayDto | undefined => {
    const spins = typedOr(rate(), assumedRate())
    const ballValue = exchange()
    return spins === undefined || ballValue === undefined ? undefined : { spinPerformance: spins, ballValue }
  })
  const [rows] = createResource(
    () => play(),
    (conditions) => hyenaHuntTable(app.services.pachinko, props.basis, conditions, tableInitialSpins(props.reliefDrive)),
  )
  const line = (): number | undefined => ((found) => (found?.ok === true ? firstGainingRow(found.value)?.initialSpins : undefined))(rows.latest)
  const seated = (): number | undefined => chosen() ?? line()
  const bring = bringIntoView(
    () => props.brought,
    () => rows.latest?.ok === true,
  )
  return (
    <section ref={bring.fallback} class="flex flex-col gap-3" aria-label="遊タイム狙い">
      <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">遊タイム狙い（{formatCount(props.reliefDrive)}回転で発動）</h2>
      <div class="grid max-w-sm grid-cols-2 gap-3">
        <TextField label="回転率" value={rate()} onChange={setRate} inputMode="decimal" suffix="回/千円" placeholder={assumedRate().toFixed(1)} invalid={unready.red() && typedOr(rate(), assumedRate()) === undefined} onFocus={unready.settle} />
        <TextField
          label="交換率"
          value={value()}
          onChange={setValue}
          inputMode="decimal"
          suffix="円/玉"
          placeholder={String(Number(startBallValue().toFixed(2)))}
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
                    <tr ref={(element) => line() === row.initialSpins && bring.target(element)} class="border-t border-border hover:bg-surface-3/60" classList={{ "bg-accent/10": seated() === row.initialSpins }}>
                      <td class="py-1.5">
                        <button type="button" class="text-accent hover:underline" aria-pressed={seated() === row.initialSpins} onClick={() => setChosen(row.initialSpins)}>
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
        <p class="text-xs text-text-muted">打ち始めの回転数を選ぶと、そこからシミュレーションします。</p>
      </Show>
      <HyenaHuntRun basis={props.basis} initialSpins={seated() ?? 0} play={play()} onUnready={unready.nudge} />
    </section>
  )
}
