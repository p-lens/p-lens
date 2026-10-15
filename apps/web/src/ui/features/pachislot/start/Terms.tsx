import { createSignal, Show, type JSX } from "solid-js"

import { tierOf, UNKNOWN_TIER } from "../../../../core/parlor/terms"
import { CloseIcon } from "../../../primitives/icons"
import { CautionNote } from "../../../primitives/popover"
import { TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { readTerms, replayFeeOf, replayPaysMoreThanItTakes, type TermsField, type TermsForm } from "../../live/start-terms"

/** How a name over one of the terms is written: a size under the app's small one and never broken, so that six characters stay on one line over a cell a quarter of the narrowest phone wide. */
const TERM_NAME = "whitespace-nowrap text-[11px] font-bold leading-4 tracking-wide text-text-secondary"

/** One of a corner's numbers under its own short name. The name is drawn here, in the terms' own size, and the field keeps it only for a screen reader. */
function TermField(props: {
  readonly label: string
  readonly field: TermsField
  readonly suffix: string
  readonly inputMode?: "numeric" | "decimal"
  readonly form: TermsForm
  readonly invalid: readonly TermsField[]
  readonly onChange: (field: TermsField, text: string) => void
  readonly onFocus: () => void
}): JSX.Element {
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <span aria-hidden="true" class={TERM_NAME}>
        {props.label}
      </span>
      <TextField
        label={props.label}
        labelHidden
        value={props.form[props.field]}
        onChange={(text) => props.onChange(props.field, text)}
        inputMode={props.inputMode ?? "numeric"}
        suffix={props.suffix}
        invalid={props.invalid.includes(props.field)}
        onFocus={props.onFocus}
        required
        compact
      />
    </div>
  )
}

/** What a corner that takes a fee on a replay usually takes, to start from: 23 paid out for 26 off the savings, the gap between what ¥500 rents and what it is exchanged for. */
const USUAL_FEE = { replayPaidOut: "23", replayDeducted: "26" } as const

/**
 * The form with a replay said to take a fee or none: the counts are what
 * says it, so the switch writes them — the same count twice for none, the
 * usual pair for a fee — and they are typed over like any others.
 */
const withReplayFee = (form: TermsForm, fee: "none" | "charged"): TermsForm => {
  const paidOut = form.replayPaidOut === "" ? USUAL_FEE.replayPaidOut : form.replayPaidOut
  return fee === "charged" ? { ...form, ...USUAL_FEE } : { ...form, replayPaidOut: paidOut, replayDeducted: paidOut }
}

/**
 * The corner's slot terms: what renting costs, what exchanging pays, and
 * what a replay takes, with the rate they come to. A replay is first only
 * asked about — a fee or none — since few corners take one; said to take
 * one, the question gives its place to the replay's two counts and a cross,
 * which says none again and brings the question back. The rental and the
 * exchange keep one half of the width and the replay the other, whichever
 * of the two it shows.
 */
export function Terms(props: {
  readonly form: TermsForm
  readonly invalid: readonly TermsField[]
  readonly onChange: (form: TermsForm) => void
  readonly onFocus: () => void
}): JSX.Element {
  /** Whether the replay's counts are set out to stay: asked for, or typed into once they were there — so they stay out even at the moment the two read the same. */
  const [setOut, setSetOut] = createSignal(replayFeeOf(props.form) === "charged")
  const counted = (): boolean => setOut() || replayFeeOf(props.form) === "charged"
  const change = (field: TermsField, text: string): void => {
    setSetOut(counted())
    props.onChange({ ...props.form, [field]: text })
  }
  const sayFee = (fee: "none" | "charged"): void => {
    setSetOut(fee === "charged")
    props.onChange(withReplayFee(props.form, fee))
  }
  const tier = (): string | undefined => {
    const read = readTerms(props.form, "slot")
    return read.ok ? tierOf("slot", read.value) : undefined
  }
  return (
    <div class="grid grid-cols-1 gap-x-2 sm:grid-cols-2">
      <div class="flex flex-col gap-2">
        <div class="grid grid-cols-2 items-end gap-x-1.5">
          <div class="grid grid-cols-2 gap-x-1.5">
            <TermField label="貸枚(千円)" field="rentalTokens" suffix="枚" form={props.form} invalid={props.invalid} onChange={change} onFocus={props.onFocus} />
            <TermField label="交換(100円)" field="exchange" suffix="枚" inputMode="decimal" form={props.form} invalid={props.invalid} onChange={change} onFocus={props.onFocus} />
          </div>
          <Show
            when={counted()}
            fallback={
              <div class="flex flex-col gap-1.5">
                <span class={TERM_NAME}>再プレイ手数料</span>
                <ToggleGroup
                  value="none"
                  onChange={(value: string | null) => {
                    if (value === "charged") sayFee("charged")
                  }}
                  aria-label="再プレイ手数料"
                >
                  <ToggleGroupItem value="none">なし</ToggleGroupItem>
                  <ToggleGroupItem value="charged">あり</ToggleGroupItem>
                </ToggleGroup>
              </div>
            }
          >
            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-x-1">
              <TermField label="再プレイ払出" field="replayPaidOut" suffix="枚" form={props.form} invalid={props.invalid} onChange={change} onFocus={props.onFocus} />
              <TermField label="再プレイ減数" field="replayDeducted" suffix="枚" form={props.form} invalid={props.invalid} onChange={change} onFocus={props.onFocus} />
              <button type="button" onClick={() => sayFee("none")} class="flex h-10 w-5 items-center justify-center rounded-[3px] text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-4">
                <CloseIcon label="再プレイ手数料をなしにする" />
              </button>
            </div>
          </Show>
        </div>
        <div class="flex min-h-4 flex-col items-start gap-1">
          <Show when={replayPaysMoreThanItTakes(props.form)}>
            <CautionNote hint="再プレイは、払い出す枚数と同じか、それより多い数を貯枚から引くのがふつうです。払出と減数が逆になっていないか確かめてください。このままでも記録できます。">再プレイ払出が減数より多くなっています。ご確認ください。</CautionNote>
          </Show>
          <Show when={tier()} keyed>
            {(found) => (
              <Show when={found === UNKNOWN_TIER} fallback={<p class="text-xs text-text-muted">{found}コーナーとして記録します。</p>}>
                <CautionNote hint="貸枚は1,000円あたり、交換は100円あたりの枚数に換算して入力してください。このままでも記録できます。">レート不明です。ご確認ください。</CautionNote>
              </Show>
            )}
          </Show>
        </div>
      </div>
    </div>
  )
}
