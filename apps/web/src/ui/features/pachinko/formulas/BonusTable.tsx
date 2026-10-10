import type { BonusShape } from "@p-lens/contracts/pachinko"
import { For, Show, type JSX } from "solid-js"

import { bonusGain } from "../../../../core/catalog/bonuses"
import type { Bonus } from "../../../../core/pachinko/formula"
import { BONUS_FIELDS, bonusRoundsText } from "../../../wording/pachinko/machine"
import { signedBalls } from "../../../wording/pachinko/play"

/** The rounds a bonus is told by, where the basis has exactly one bonus paying out and taking what it does; none where it has no such bonus, or several. */
const roundsOf = (bonus: Bonus, shapes: readonly BonusShape[]): BonusShape | undefined => {
  const alike = shapes.filter((shape) => shape.payout === bonus.payout && shape.spent === bonus.spent)
  return alike.length === 1 ? alike[0] : undefined
}

/**
 * A formula's bonuses as a table to read: what each goes by, the balls it
 * pays out, the balls shot to get them and what that leaves in hand — and,
 * under its name, the rounds it is where the basis says which. A play
 * records a jackpot as one of these.
 */
export function BonusTable(props: { readonly bonuses: readonly Bonus[]; readonly shapes: readonly BonusShape[] }): JSX.Element {
  return (
    <table class="w-full whitespace-nowrap text-sm tabular-nums">
      <thead>
        <tr class="text-left text-xs text-text-muted">
          <th class="py-1 font-normal">{BONUS_FIELDS.name}</th>
          <th class="py-1 pl-3 text-right font-normal">{BONUS_FIELDS.payout}</th>
          <th class="py-1 pl-3 text-right font-normal">{BONUS_FIELDS.spent}</th>
          <th class="py-1 pl-3 text-right font-normal">増減</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.bonuses}>
          {(bonus) => (
            <tr class="border-t border-border align-top">
              <td class="py-1">
                {bonus.name}
                <Show when={roundsOf(bonus, props.shapes)} keyed>
                  {(shape) => <span class="block text-[11px] text-text-muted">{bonusRoundsText(shape)}</span>}
                </Show>
              </td>
              <td class="py-1 pl-3 text-right">{bonus.payout.toLocaleString("ja-JP")}玉</td>
              <td class="py-1 pl-3 text-right">{bonus.spent.toLocaleString("ja-JP")}玉</td>
              <td class="py-1 pl-3 text-right">{signedBalls(bonusGain(bonus))}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}
