import { Show, type JSX } from "solid-js"

import type { PlayOutlook } from "../../../../application/pachislot/weighing"
import { theoreticalYenText, medalsPerGameText, payoutRateText, UNSEEN } from "../../../wording/pachislot/formula"
import { SettingLevelOdds } from "./SettingLevelOdds"

function Tile(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <dt class="text-xs font-bold text-text-muted">{props.label}</dt>
      <dd class="text-xl font-bold tabular-nums text-text-primary">{props.value}</dd>
    </div>
  )
}

/**
 * How a cabinet looks by what has been seen at it: the odds of each setting
 * level, then the theoretical value of a game, an hour and the games played
 * so far under them. Yen is shown only where the play has terms to price
 * it by. A cabinet whose figures rest on nothing has dashes for all of them.
 */
export function OutlookPanel(props: { readonly outlook: PlayOutlook; readonly prior: string }): JSX.Element {
  return (
    <div class="flex flex-col gap-3">
      <SettingLevelOdds settingLevels={props.outlook.settingLevels} prior={props.prior} grounded={props.outlook.grounded} />
      <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="期待機械割" value={props.outlook.grounded ? payoutRateText(props.outlook.payoutRate) : UNSEEN.payoutRate} />
        <Show when={props.outlook.netPerGame !== undefined}>
          <Tile label="1Gあたり" value={props.outlook.grounded ? medalsPerGameText(props.outlook.netPerGame ?? 0) : UNSEEN.medalsPerGame} />
        </Show>
        <Show when={props.outlook.theoreticalValuePerHour !== undefined}>
          <Tile label="期待値（時給）" value={props.outlook.grounded ? theoreticalYenText(props.outlook.theoreticalValuePerHour ?? 0) : UNSEEN.yen} />
        </Show>
        <Show when={props.outlook.theoreticalValue !== undefined}>
          <Tile label="期待値（ここまで）" value={props.outlook.grounded ? theoreticalYenText(props.outlook.theoreticalValue ?? 0) : UNSEEN.yen} />
        </Show>
      </dl>
      <Show when={!props.outlook.priced}>
        <p class="text-xs text-text-muted">貸枚と換金のレートを入れると、期待値が円で出ます。</p>
      </Show>
    </div>
  )
}
