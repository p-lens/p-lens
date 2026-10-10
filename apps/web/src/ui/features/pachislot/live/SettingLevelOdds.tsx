import type { WeightDto } from "@p-lens/contracts/pachislot"
import { Index, Show, type JSX } from "solid-js"

import { readSettingLevels } from "../../../../core/pachislot/setting-level-reading"
import { averageSettingLevelText, shareText, UNSEEN } from "../../../wording/pachislot/formula"

function Bar(props: { readonly weight: WeightDto; readonly largest: number; readonly high: boolean; readonly grounded: boolean }): JSX.Element {
  return (
    <li class="flex items-center gap-2 text-sm tabular-nums">
      <span class="w-12 shrink-0 text-text-secondary">設定{props.weight.settingLevel}</span>
      <span class="h-3 flex-1 overflow-hidden rounded-sm bg-surface-3">
        <span
          class="block h-full rounded-sm"
          classList={{ "bg-accent": props.high, "bg-text-muted": !props.high }}
          style={{ width: `${props.grounded && props.largest > 0 ? (props.weight.probability / props.largest) * 100 : 0}%` }}
        />
      </span>
      <span class="w-14 shrink-0 text-right text-text-primary">{props.grounded ? shareText(props.weight.probability) : UNSEEN.share}</span>
    </li>
  )
}

/**
 * How likely each setting is, as bars scaled to the likeliest, under the
 * figures players read off them: 高設定期待度, 期待設定 and the most likely
 * setting. Says which prior it rests on, since the same counts read very
 * differently under an even spread and a weekday's. With nothing seen at
 * the cabinet and no 設定配分 chosen, the odds are an even spread's alone and
 * every figure is dashes: its "most likely" would be whichever came last.
 */
export function SettingLevelOdds(props: { readonly settingLevels: readonly WeightDto[]; readonly prior: string; readonly grounded: boolean }): JSX.Element {
  const reading = () => readSettingLevels(props.settingLevels)
  const largest = () => Math.max(0, ...props.settingLevels.map((weight) => weight.probability))
  return (
    <section class="flex flex-col gap-3">
      <dl class="grid grid-cols-3 gap-2">
        <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
          <dt class="text-xs font-bold text-text-muted">高設定（{reading().threshold}以上）</dt>
          <dd class="text-xl font-bold tabular-nums text-text-primary">{props.grounded ? shareText(reading().highShare) : UNSEEN.share}</dd>
        </div>
        <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
          <dt class="text-xs font-bold text-text-muted">期待設定</dt>
          <dd class="text-xl font-bold tabular-nums text-text-primary">{props.grounded ? averageSettingLevelText(reading().averageSettingLevel) : UNSEEN.averageSettingLevel}</dd>
        </div>
        <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
          <dt class="text-xs font-bold text-text-muted">最有力</dt>
          <dd class="text-xl font-bold tabular-nums text-text-primary">
            <Show when={props.grounded ? reading().mostLikely : undefined} fallback={UNSEEN.settingLevel}>
              {(settingLevel) => `設定${settingLevel()}`}
            </Show>
          </dd>
        </div>
      </dl>
      <ol class="flex flex-col gap-1">
        <Index each={props.settingLevels}>
          {(weight) => <Bar weight={weight()} largest={largest()} high={weight().settingLevel >= reading().threshold} grounded={props.grounded} />}
        </Index>
      </ol>
      <p class="text-xs text-text-muted">{props.grounded ? `設定配分「${props.prior}」のもとでの見込みです。` : "データカウンターを入れるか、設定配分を選ぶと、見込みが出ます。"}</p>
    </section>
  )
}
