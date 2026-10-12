import type { AllotmentDto } from "@p-lens/contracts/pachinko"
import { For, Show, type JSX } from "solid-js"

import { bonusShapes } from "../../../../core/pachinko/bonuses"
import type { Basis, Bonus } from "../../../../core/pachinko/formula"
import { modesOf, regularOf, type ModeView } from "../../../../core/pachinko/world"
import { jackpotsText } from "../../../wording/pachinko/machine"
import { BonusTable } from "./BonusTable"
import { kindText, nextText, ownAttackerText, probabilityText, roundPayoutText, shareText } from "./spec-text"

function AllotmentTable(props: { readonly allotment: readonly AllotmentDto[]; readonly modes: readonly ModeView[] }): JSX.Element {
  return (
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-text-muted">
          <th class="py-1 font-normal">振分</th>
          <th class="py-1 font-normal">R</th>
          <th class="py-1 font-normal">その後</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.allotment}>
          {(share) => (
            <tr class="border-t border-border tabular-nums">
              <td class="py-1">{shareText(share.shareBasisPoints)}</td>
              <td class="py-1">
                <For each={[share, ...(share.otherRounds ?? [])]}>
                  {(rounds, at) => (
                    <span class="mr-2 inline-block">
                      {at() > 0 ? "+" : ""}
                      {rounds.rounds}R
                      <Show when={ownAttackerText(rounds)} keyed>
                        {(attacker) => <span class="ml-1 text-xs text-text-muted">{attacker}</span>}
                      </Show>
                    </span>
                  )}
                </For>
                <Show when={jackpotsText(share)} keyed>
                  {(jackpots) => <span class="block text-[11px] text-text-muted">{jackpots}</span>}
                </Show>
              </td>
              <td class="py-1">{nextText(share.next, props.modes)}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

function Block(props: { readonly title: string; readonly subtitle?: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <section class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
      <header class="flex items-baseline justify-between gap-3">
        <h3 class="font-semibold text-text-primary">{props.title}</h3>
        <Show when={props.subtitle}>
          <span class="text-sm text-text-secondary">{props.subtitle}</span>
        </Show>
      </header>
      {props.children}
    </section>
  )
}

/**
 * A formula's 期待値基礎値 in the words of the spec sheet: everything the
 * simulation was run from, as a professional checks it. Nothing here is a state.
 */
export function SpecReadout(props: { readonly basis: Basis; readonly bonuses: readonly Bonus[]; readonly spinsPerHour: number | undefined }): JSX.Element {
  const modes = (): readonly ModeView[] => modesOf(props.basis.spec)
  const payout = (): Basis["spec"]["resources"]["payout"] => props.basis.spec.resources.payout
  return (
    <div class="flex flex-col gap-3">
      <Show when={regularOf(props.basis.spec)} keyed>
        {(regular) => (
          <Block title="通常時" subtitle={`大当り ${probabilityText(regular.chance)}${regular.reliefDrive === undefined ? "" : `・遊タイム ${regular.reliefDrive.gauge}回転`}`}>
            <AllotmentTable allotment={regular.allotment} modes={modes()} />
          </Block>
        )}
      </Show>
      <For each={modes()}>
        {(mode) => (
          <Block title={mode.label} subtitle={kindText(mode.kind)}>
            <AllotmentTable allotment={mode.allotment} modes={modes()} />
            <p class="text-sm text-text-secondary">
              終了後: {nextText(mode.onMiss, modes())}
              <Show when={mode.luckyTrigger} keyed>
                {(trigger) => ` ／ ${trigger.atCombo}連目で ${nextText({ type: "mode", mode: trigger.to }, modes())} へ`}
              </Show>
            </p>
          </Block>
        )}
      </For>
      <Block title="出玉" subtitle={`賞球 ${payout().prizeBalls}個 × ${payout().count}カウント`}>
        <p class="text-sm text-text-secondary">
          計算条件: {roundPayoutText(props.basis.conditions, props.basis.normalized.netBallsPerRound)}
          <Show when={props.spinsPerHour} keyed>
            {(speed) => ` ／ 1時間 ${speed}回転`}
          </Show>
        </p>
      </Block>
      <Show when={props.bonuses.length > 0}>
        <Block title="ボーナス" subtitle="稼働中に記録する大当り">
          <BonusTable bonuses={props.bonuses} shapes={bonusShapes(props.basis.spec)} />
        </Block>
      </Show>
    </div>
  )
}
