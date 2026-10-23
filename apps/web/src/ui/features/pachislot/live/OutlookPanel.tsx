import type { HuntDto } from "@p-lens/contracts/pachislot"
import { Show, type JSX } from "solid-js"

import type { PlayOutlook } from "../../../../application/pachislot/weighing"
import { theoreticalFigureText } from "../../../wording/numbers"
import { aboutText, medalsPerGameText, payoutRateText, shareText, signedMedalsText, UNSEEN } from "../../../wording/pachislot/formula"
import { SettingLevelOdds } from "./SettingLevelOdds"
import { seal } from "../../../../mummer"

function Tile(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <dt class="text-xs font-bold text-text-muted">{props.label}</dt>
      <dd class="text-xl font-bold tabular-nums text-text-primary">{props.value}</dd>
    </div>
  )
}

/**
 * 天井狙い at an AT machine: what playing on from where it stands until the
 * next AT is over is worth — in yen with terms, else in medals — the
 * regular games it takes, what the AT gains on average and, where bonuses
 * bring it, what they pay on the way, and how often a ceiling wins it.
 */
function Hunt(props: { readonly hunt: HuntDto; readonly priced: boolean; readonly grounded: boolean }): JSX.Element {
  const shown = (text: string, unseen: string): string => (props.grounded ? text : unseen)
  return (
    <section class="flex flex-col gap-2">
      <h3 class="text-xs font-bold uppercase tracking-wide text-text-secondary">天井狙い（AT終了まで）</h3>
      <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="期待値" value={props.priced ? shown(theoreticalFigureText(seal.play(props.hunt.yen)), UNSEEN.yen) : shown(signedMedalsText(seal.play(props.hunt.medals)), UNSEEN.medals)} />
        <Tile label="ATまで" value={shown(aboutText(props.hunt.games, "G"), UNSEEN.games)} />
        <Tile label="ATの獲得" value={shown(aboutText(props.hunt.atMedals, "枚"), UNSEEN.medals)} />
        <Show when={props.hunt.triggerMedals > 0}>
          <Tile label="ボーナスの獲得" value={shown(aboutText(props.hunt.triggerMedals, "枚"), UNSEEN.medals)} />
        </Show>
        <Tile label="天井で当選" value={shown(shareText(props.hunt.byCeiling), UNSEEN.share)} />
      </dl>
      <p class="text-xs text-text-muted">ここから打ち続けて、次のATが終わるまでの平均です。</p>
    </section>
  )
}

/**
 * How a cabinet looks by what has been seen at it: the odds of each setting
 * level, then the theoretical value of a game, an hour and the games played
 * so far under them, and at an AT machine what playing on to the next AT
 * is worth. Yen is shown only where the play has terms to price it by. A
 * cabinet whose figures rest on nothing has dashes for all of them.
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
          <Tile label="期待値（時給）" value={props.outlook.grounded ? theoreticalFigureText(seal.play(props.outlook.theoreticalValuePerHour ?? 0)) : UNSEEN.yen} />
        </Show>
        <Show when={props.outlook.theoreticalValue !== undefined}>
          <Tile label="期待値（ここまで）" value={props.outlook.grounded ? theoreticalFigureText(seal.play(props.outlook.theoreticalValue ?? 0)) : UNSEEN.yen} />
        </Show>
      </dl>
      <Show when={props.outlook.hunt} keyed>
        {(hunt) => <Hunt hunt={hunt} priced={props.outlook.priced} grounded={props.outlook.grounded} />}
      </Show>
      <Show when={!props.outlook.priced}>
        <p class="text-xs text-text-muted">貸枚のレートと交換率を入れると、期待値が円で出ます。</p>
      </Show>
    </div>
  )
}
