import type { BonusShape } from "@p-lens/contracts/pachinko"
import { Index, Show, type JSX } from "solid-js"

import { type BonusNameProblem, defaultBonusName } from "../../../../core/pachinko/bonuses"
import { TextField } from "../../../primitives/text-field"
import { BONUS_FIELDS, bonusRoundsText, describeBonusNameProblem } from "../../../wording/pachinko/machine"

const ROW = "grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem] items-end gap-1.5"

const CELL = "flex h-10 items-center justify-end rounded-[3px] px-2 text-sm tabular-nums text-text-secondary"

/**
 * The bonuses a basis's jackpots pay, a row each, to be named: what a
 * bonus pays out and takes is its rounds' and stands as it is, so only
 * what it goes by is typed — a play records a jackpot under it. A bonus
 * left unnamed goes by its rounds. Rows are an `<Index>`, so typing a
 * name never rebuilds its row.
 */
export function BonusNames(props: {
  readonly shapes: readonly BonusShape[]
  readonly names: Readonly<Record<string, string>>
  readonly problems: readonly BonusNameProblem[]
  readonly onChange: (names: Readonly<Record<string, string>>) => void
}): JSX.Element {
  const wrong = (index: number): boolean => props.problems.some((problem) => problem.index === index)
  return (
    <div class="flex max-w-md flex-col gap-2">
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">ボーナス</span>
      <div class="flex flex-col gap-1.5">
        <Index each={props.shapes}>
          {(shape, index) => (
            <div class="flex flex-col gap-0.5">
              <div class={ROW}>
                <TextField
                  label={BONUS_FIELDS.name}
                  labelHidden={index > 0}
                  value={props.names[shape().key] ?? ""}
                  onChange={(name) => props.onChange({ ...props.names, [shape().key]: name })}
                  placeholder={defaultBonusName(props.shapes, index)}
                  invalid={wrong(index)}
                  compact
                />
                <div class="flex flex-col gap-1.5">
                  <Show when={index === 0}>
                    <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">{BONUS_FIELDS.payout}</span>
                  </Show>
                  <span class={CELL}>{shape().payout}玉</span>
                </div>
                <div class="flex flex-col gap-1.5">
                  <Show when={index === 0}>
                    <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">{BONUS_FIELDS.spent}</span>
                  </Show>
                  <span class={CELL}>{shape().spent}玉</span>
                </div>
              </div>
              <span class="text-[11px] text-text-muted">{bonusRoundsText(shape())}</span>
            </div>
          )}
        </Index>
      </div>
      <Show when={props.problems.at(0)} keyed>
        {(problem) => <p class="text-xs text-negative">{describeBonusNameProblem(problem)}</p>}
      </Show>
      <p class="text-xs text-text-muted">振分のR数・賞球・カウントが同じ大当りを、1つのボーナスにまとめています。払出と消費は振分から決まるので、付けるのは名前だけです。稼働中は、この名前で大当りを記録します。</p>
    </div>
  )
}
