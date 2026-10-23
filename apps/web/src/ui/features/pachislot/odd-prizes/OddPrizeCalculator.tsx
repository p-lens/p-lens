import { createSignal, For, Index, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { oddPrizeReckoningOf, stagesOf, STAGE_STEPS, type Stage, type OddPrizeReckoning, type StageStep } from "../../../../core/savings/odd-prize-reckoning"
import { useApp } from "../../../context"
import { TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import type { Place } from "../../../navigation/place"
import { amountText, formatCount, formatYen } from "../../../wording/numbers"
import { readCalculator, type CalculatorField, type CalculatorForm } from "../../odd-prize-calculator/calculator-form"
import { useOpeningCalculator } from "../../odd-prize-calculator/opening"
import { ViewHeader } from "../../shell/ViewHeader"
import { seal } from "../../../../mummer"

/** What each figure shows before the medals and the corner's rates read, in the shape it would have. */
const UNREAD = { yen: "¥-,---", medals: "---枚" } as const

/** How a name over one of the fields is written, as over a corner's terms at the start of a play. */
const FIELD_NAME = "whitespace-nowrap text-[11px] font-bold leading-4 tracking-wide text-text-secondary"

function Field(props: {
  readonly label: string
  readonly field: CalculatorField
  readonly inputMode: "numeric" | "decimal"
  readonly form: CalculatorForm
  readonly invalid: readonly CalculatorField[]
  readonly onChange: (field: CalculatorField, text: string) => void
}): JSX.Element {
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <span aria-hidden="true" class={FIELD_NAME}>
        {props.label}
      </span>
      <TextField
        label={props.label}
        labelHidden
        value={props.form[props.field]}
        onChange={(text) => props.onChange(props.field, text)}
        inputMode={props.inputMode}
        suffix="枚"
        invalid={props.invalid.includes(props.field)}
        compact
      />
    </div>
  )
}

/** Rows of dashes in the shape of the stages, before the medals and the corner's rates read. */
const UNREAD_STAGES = [undefined, undefined, undefined, undefined] as const

/** The counts of medals to stop at, the nearest first and none left last: how many to keep, the special prizes they come to, and how many to play first. */
function Stages(props: { readonly stages: readonly Stage[] | undefined }): JSX.Element {
  const rows = (): readonly (Stage | undefined)[] => props.stages ?? UNREAD_STAGES
  return (
    <table class="w-full whitespace-nowrap text-sm tabular-nums">
      <thead>
        <tr class="text-left text-xs text-text-muted">
          <th class="py-1 font-normal">メダル数</th>
          <th class="py-1 pl-3 text-right font-normal">特殊景品</th>
          <th class="py-1 pl-3 text-right font-normal">端数</th>
        </tr>
      </thead>
      <tbody>
        <Index each={rows()}>
          {(stage) => (
            <tr class="border-t border-border">
              <td class="py-1.5 text-base font-semibold text-text-primary">{((found) => (found === undefined ? UNREAD.medals : `${amountText(seal.play(found.kept))}枚`))(stage())}</td>
              <td class="py-1.5 pl-3 text-right">
                {((found) => (found === undefined ? UNREAD.yen : formatYen(seal.play(found.specialPrizes))))(stage())}
              </td>
              <td class="py-1.5 pl-3 text-right text-base font-semibold text-text-primary">{((found) => (found === undefined ? UNREAD.medals : `${amountText(seal.play(found.toPlay))}枚`))(stage())}</td>
            </tr>
          )}
        </Index>
      </tbody>
    </table>
  )
}

/**
 * The medals typed, at the corner's rental and exchange: what they are
 * worth at the exchange and what as many played again would have cost to
 * rent, and below, the counts to stop at that exchange for special prizes
 * and as little else as can be, by the step last chosen on the device — a
 * person who would rather play on than stop at the odd few sees how far
 * each is.
 */
function Calculator(props: { readonly opening: CalculatorForm }): JSX.Element {
  const [form, setForm] = createSignal(props.opening)
  const read = () => readCalculator(form(), "pachislot")
  const reckoning = (): OddPrizeReckoning | undefined => ((found) => (found.ok ? oddPrizeReckoningOf(found.value.tokens, found.value.terms) : undefined))(read())
  const app = useApp()
  const [step, setStep] = createSignal<StageStep>(app.services.preferences.stageStep())
  const stages = (): readonly Stage[] | undefined => ((found) => (found.ok ? stagesOf(found.value.tokens, found.value.terms.exchange, step()) : undefined))(read())
  const invalid = (): readonly CalculatorField[] => ((found) => (found.ok ? [] : found.error))(read())
  const change = (field: CalculatorField, text: string): void => void setForm({ ...form(), [field]: text })
  return (
    <div class="flex max-w-md flex-col gap-5 p-4">
      <div class="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-x-1.5">
        <Field label="持ちメダル枚数" field="tokens" inputMode="numeric" form={form()} invalid={invalid()} onChange={change} />
        <Field label="貸枚(千円)" field="rentalTokens" inputMode="numeric" form={form()} invalid={invalid()} onChange={change} />
        <Field label="交換(100円)" field="exchange" inputMode="decimal" form={form()} invalid={invalid()} onChange={change} />
      </div>
      <dl class="grid grid-cols-2 gap-x-3">
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-text-muted">交換で</dt>
          <dd class="text-lg font-semibold tabular-nums text-text-primary">{((found) => (found === undefined ? UNREAD.yen : formatYen(seal.play(found.exchanged))))(reckoning())}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-text-muted">貸枚換算</dt>
          <dd class="text-lg font-semibold tabular-nums text-text-secondary">{((found) => (found === undefined ? UNREAD.yen : formatYen(seal.play(found.rented))))(reckoning())}</dd>
        </div>
      </dl>
      <div class="flex flex-col gap-2">
        <ToggleGroup
          value={String(step())}
          onChange={(value: string | null) => {
            const chosen = STAGE_STEPS.find((each) => String(each) === value)
            if (chosen === undefined) return
            setStep(chosen)
            app.services.preferences.setStageStep(chosen)
          }}
          aria-label="区切り"
        >
          <For each={STAGE_STEPS}>{(each) => <ToggleGroupItem value={String(each)}>{`${formatCount(each)}円`}</ToggleGroupItem>}</For>
        </ToggleGroup>
        <Stages stages={stages()} />
      </div>
    </div>
  )
}

/** The pachislot odd-prize calculator, opening on the latest pachislot play's corner. It keeps and writes nothing. */
export function OddPrizeCalculator(props: { readonly place: Place }): JSX.Element {
  const opening = useOpeningCalculator("pachislot")
  return (
    <MainContent header={<ViewHeader place={props.place} title="スロットの端玉計算" />}>
      <Show when={opening()} keyed>
        {(form) => <Calculator opening={form} />}
      </Show>
    </MainContent>
  )
}
