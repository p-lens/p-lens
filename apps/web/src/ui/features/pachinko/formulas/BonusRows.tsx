import { Index, Show, type JSX } from "solid-js"

import { type BonusField, type BonusProblem, type BonusRow, EMPTY_BONUS_ROW, takesAnotherBonus } from "../../../../core/catalog/bonuses"
import { Button } from "../../../primitives/button"
import { CloseIcon } from "../../../primitives/icons"
import { TextField } from "../../../primitives/text-field"
import { BONUS_FIELDS, describeBonusProblem } from "../../../wording/pachinko/machine"

const ROW = "grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem_3.25rem_1.75rem] items-end gap-1.5"

const without = (rows: readonly BonusRow[], row: number): readonly BonusRow[] => {
  const left = rows.filter((_, index) => index !== row)
  return left.length === 0 ? [EMPTY_BONUS_ROW] : left
}

/**
 * A typed-in formula's bonuses, a row each: what the bonus goes by, the
 * balls it pays out, the balls spent winning it, and — where a machine
 * gives a run of jackpots as one win — the jackpots it is won over. A formula with no
 * basis has nothing to take them from, so at least one is typed. The first row heads the
 * columns; a row is taken away with its cross, the last one emptying
 * instead, and another is added below until the catalog takes no more.
 * Rows are an `<Index>`, so typing into one never rebuilds it.
 */
export function BonusRows(props: {
  readonly rows: readonly BonusRow[]
  readonly problems: readonly BonusProblem[]
  /** Marked as wanting, as a field is after a press that needed it: no bonus is typed yet. */
  readonly wanting: boolean
  readonly onFocus: () => void
  readonly onChange: (rows: readonly BonusRow[]) => void
}): JSX.Element {
  const change = (row: number, field: BonusField, text: string): void => props.onChange(props.rows.map((typed, index) => (index === row ? { ...typed, [field]: text } : typed)))
  const wrong = (row: number, field: BonusField): boolean => (props.wanting && row === 0) || props.problems.some((problem) => problem.row === row && problem.field === field)
  return (
    <div class="flex flex-col gap-2">
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">ボーナス</span>
      <div class="flex flex-col gap-1.5">
        <Index each={props.rows}>
          {(typed, row) => (
            <div class={ROW}>
              <TextField label={BONUS_FIELDS.name} labelHidden={row > 0} value={typed().name} onChange={(text) => change(row, "name", text)} placeholder="10R確変" invalid={wrong(row, "name")} onFocus={props.onFocus} compact />
              <TextField label={BONUS_FIELDS.payout} labelHidden={row > 0} value={typed().payout} onChange={(text) => change(row, "payout", text)} inputMode="numeric" suffix="玉" invalid={wrong(row, "payout")} onFocus={props.onFocus} compact />
              <TextField label={BONUS_FIELDS.spent} labelHidden={row > 0} value={typed().spent} onChange={(text) => change(row, "spent", text)} inputMode="numeric" suffix="玉" invalid={wrong(row, "spent")} onFocus={props.onFocus} compact />
              <TextField label="回数" labelHidden={row > 0} value={typed().jackpots} onChange={(text) => change(row, "jackpots", text)} inputMode="numeric" placeholder="1" suffix="回" invalid={!props.wanting && wrong(row, "jackpots")} onFocus={props.onFocus} compact />
              <button
                type="button"
                onClick={() => props.onChange(without(props.rows, row))}
                class="flex h-10 items-center justify-center rounded-[3px] text-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-4"
              >
                <CloseIcon label={`${row + 1}行目のボーナスを消す`} />
              </button>
            </div>
          )}
        </Index>
      </div>
      <Show when={props.problems.at(0)} keyed>
        {(problem) => <p class="text-xs text-negative">{describeBonusProblem(problem)}</p>}
      </Show>
      <p class="text-xs text-text-muted">払出は獲得する玉、消費はそのために打ち込む玉です。回数は、データカウンタで大当り何回と数えられるかです。3000発を10R×2回で出す機種なら2、ふつうの大当りは空欄のままで1回です。</p>
      <Show when={takesAnotherBonus(props.rows)}>
        <div>
          <Button variant="secondary" size="small" onClick={() => props.onChange([...props.rows, EMPTY_BONUS_ROW])}>
            ボーナスを追加
          </Button>
        </div>
      </Show>
    </div>
  )
}
