import { Index, Show, type JSX } from "solid-js"

import type { SettingLevelFigures } from "../../../../core/pachislot/figures"
import type { Sampling } from "../../../../core/pachislot/formula"
import { formatCount } from "../../../wording/numbers"
import { oddsText, payoutRateText, shareText } from "../../../wording/pachislot/formula"

/** Each setting level's figures as a table: its 機械割, each bonus's odds, and their 合算. */
export function FiguresTable(props: { readonly figures: readonly SettingLevelFigures[]; readonly sampling: Sampling | undefined }): JSX.Element {
  const bonuses = (): readonly { readonly id: string; readonly label: string }[] => props.figures[0]?.bonuses ?? []
  const gains = (): boolean => props.figures.some((figures) => figures.at !== undefined)
  const completes = (): boolean => props.figures.some((figures) => (figures.at?.completion ?? 0) > 0)
  const margin = (level: number): number | undefined => props.sampling?.margins.find((each) => each.settingLevel === level)?.payoutRateMargin
  return (
    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full whitespace-nowrap text-sm tabular-nums">
        <thead class="text-xs text-text-muted">
          <tr>
            <th class="px-2 py-2 text-left font-normal">設定</th>
            <th class="px-2 py-2 text-right font-normal">機械割</th>
            <Index each={bonuses()}>{(bonus) => <th class="px-2 py-2 text-right font-normal">{bonus().label}</th>}</Index>
            <th class="px-2 py-2 text-right font-normal">合算</th>
            <Show when={gains()}>
              <th class="px-2 py-2 text-right font-normal">平均獲得</th>
            </Show>
            <Show when={completes()}>
              <th class="px-2 py-2 text-right font-normal">完走率</th>
            </Show>
          </tr>
        </thead>
        <tbody>
          <Index each={props.figures}>
            {(figures) => (
              <tr class="border-t border-border">
                <td class="px-2 py-2 text-text-secondary">設定{figures().settingLevel}</td>
                <td class="px-2 py-2 text-right font-semibold text-text-primary">
                  {payoutRateText(figures().payoutRate)}
                  <Show when={margin(figures().settingLevel)} keyed>
                    {(each) => <span class="ml-1 text-xs font-normal text-text-muted">±{(each * 100).toFixed(2)}</span>}
                  </Show>
                </td>
                <Index each={figures().bonuses}>{(bonus) => <td class="px-2 py-2 text-right text-text-primary">{oddsText(bonus().oneIn)}</td>}</Index>
                <td class="px-2 py-2 text-right text-text-primary">{oddsText(figures().combinedOneIn)}</td>
                <Show when={gains()}>
                  <td class="px-2 py-2 text-right text-text-primary">{figures().at === undefined ? "--" : `${formatCount(Math.round(figures().at?.gain ?? 0))}枚`}</td>
                </Show>
                <Show when={completes()}>
                  <td class="px-2 py-2 text-right text-text-primary">{shareText(figures().at?.completion ?? 0)}</td>
                </Show>
              </tr>
            )}
          </Index>
        </tbody>
      </table>
    </div>
  )
}
