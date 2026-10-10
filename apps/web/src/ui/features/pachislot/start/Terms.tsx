import { Show, type JSX } from "solid-js"

import { tierOf, UNKNOWN_TIER } from "../../../../core/parlor/terms"
import { CautionNote } from "../../../primitives/popover"
import { TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { readTerms, replayFeeOf, replayPaysMoreThanItTakes, type TermsField, type TermsForm } from "../../live/start-terms"

/** One of a corner's numbers under its own short name, in its cell of the four the terms sit in — together as wide as the parlor's field above, and no wider: a count of three digits needs no more. */
function TermField(props: {
  readonly label: string
  readonly field: TermsField
  readonly suffix: string
  readonly form: TermsForm
  readonly invalid: readonly TermsField[]
  readonly onChange: (field: TermsField, text: string) => void
  readonly onFocus: () => void
}): JSX.Element {
  return (
    <TextField
      label={props.label}
      value={props.form[props.field]}
      onChange={(text) => props.onChange(props.field, text)}
      inputMode="numeric"
      suffix={props.suffix}
      invalid={props.invalid.includes(props.field)}
      onFocus={props.onFocus}
      required
      compact
    />
  )
}

/**
 * The form with a replay said to take a fee or none: the counts are what
 * says it, so the switch writes them — the same count twice for none, and
 * for a fee the savings taken left to be typed, there being no usual one.
 */
const withReplayFee = (form: TermsForm, fee: "none" | "charged"): TermsForm => ({ ...form, replayDeducted: fee === "charged" ? "" : form.replayPaidOut })

/** The corner's slot terms: what renting costs, what exchanging pays, and what a replay takes, with the rate they come to. */
export function Terms(props: {
  readonly form: TermsForm
  readonly invalid: readonly TermsField[]
  readonly onChange: (form: TermsForm) => void
  readonly onFocus: () => void
}): JSX.Element {
  const change = (field: TermsField, text: string): void => props.onChange({ ...props.form, [field]: text })
  const tier = (): string | undefined => {
    const read = readTerms(props.form)
    return read.ok ? tierOf("slot", read.value) : undefined
  }
  return (
    <div class="grid grid-cols-1 gap-x-2 sm:grid-cols-2">
      <div class="flex flex-col gap-2">
        <div class="grid grid-cols-4 items-end gap-x-1.5 gap-y-1">
          <div class="col-span-3 col-start-2 flex items-center justify-end gap-2">
            <span class="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-text-secondary">再プレイ手数料</span>
            <ToggleGroup
              value={replayFeeOf(props.form)}
              onChange={(value: string | null) => {
                if (value === "none" || value === "charged") props.onChange(withReplayFee(props.form, value))
              }}
              aria-label="再プレイ手数料"
            >
              <ToggleGroupItem value="none" class="h-6 whitespace-nowrap px-1.5 text-xs">なし</ToggleGroupItem>
              <ToggleGroupItem value="charged" class="h-6 whitespace-nowrap px-1.5 text-xs">あり</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <TermField label="貸枚(千円)" field="rentalTokens" suffix="枚" form={props.form} invalid={props.invalid} onChange={change} onFocus={props.onFocus} />
          <TermField label="換金(千円)" field="exchangeTokens" suffix="枚" form={props.form} invalid={props.invalid} onChange={change} onFocus={props.onFocus} />
          <TermField label="再プレイ払出" field="replayPaidOut" suffix="枚" form={props.form} invalid={props.invalid} onChange={change} onFocus={props.onFocus} />
          <TermField label="再プレイ減数" field="replayDeducted" suffix="枚" form={props.form} invalid={props.invalid} onChange={change} onFocus={props.onFocus} />
        </div>
        <div class="flex min-h-4 flex-col items-start gap-1">
          <Show when={replayPaysMoreThanItTakes(props.form)}>
            <CautionNote hint="再プレイは、払い出す枚数と同じか、それより多い数を貯枚から引くのがふつうです。払出と減数が逆になっていないか確かめてください。このままでも記録できます。">再プレイ払出が減数より多くなっています。ご確認ください。</CautionNote>
          </Show>
          <Show when={tier()} keyed>
            {(found) => (
              <Show when={found === UNKNOWN_TIER} fallback={<p class="text-xs text-text-muted">{found}コーナーとして記録します。</p>}>
                <CautionNote hint="貸枚と換金は、1,000円あたりの枚数に換算して入力してください。このままでも記録できます。">レート不明です。ご確認ください。</CautionNote>
              </Show>
            )}
          </Show>
        </div>
      </div>
    </div>
  )
}
