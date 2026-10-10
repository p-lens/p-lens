// After stefan-karger/solid-ui's select, on P-Lens's tokens.

import * as SelectPrimitive from "@kobalte/core/select"
import { Show, type JSX } from "solid-js"

import { redRing } from "./nudge"

export interface SelectOption {
  readonly value: string
  readonly label: string
  /** Drawn before the label, in the list and once chosen; made afresh each time, as one element can be in one place only. */
  readonly mark?: () => JSX.Element
}

const TRIGGER =
  "flex h-10 w-full min-w-0 items-center justify-between gap-1 rounded-[3px] bg-surface-input px-3 text-left text-text-primary focus:outline-2 focus:outline-offset-0 focus:outline-focus-ring"

const LABEL = "text-xs font-bold uppercase tracking-wide text-text-secondary"

/**
 * Keeps a press on the label's words from reaching Kobalte's label, which
 * would hand the focus to the trigger: here only a press on a field itself
 * takes the focus, as with every other field.
 */
const pressStaysHere = (event: MouseEvent): void => event.stopPropagation()

/**
 * A choice of a few. With nothing to choose from it is still pressed like any
 * other — P-Lens has no controls that cannot be used — and pressing it says
 * what it is waiting on through `onEmptyPress`, nudging that field. A choice
 * is reported only when it changes: choosing what is already chosen is no news.
 */
export function Select(props: {
  readonly label: string
  readonly options: readonly SelectOption[]
  readonly value: string | undefined
  readonly onChange: (value: string) => void
  readonly placeholder: string
  readonly error?: string | undefined
  /** Marked as wrong without a word, as a field is after a press that needed it. */
  readonly invalid?: boolean
  readonly onFocus?: () => void
  /** Named for assistive technology only, where a row above already says it on screen. */
  readonly labelHidden?: boolean
  /** What pressing does while there is nothing to choose from. */
  readonly onEmptyPress?: () => void
  /** A small mark set after the label's words, on their line: something said of what is chosen. */
  readonly labelMark?: () => JSX.Element
}): JSX.Element {
  /** Kobalte takes `null` for nothing chosen; it goes no further than this call. */
  const selected = (): SelectOption | null => props.options.find((option) => option.value === props.value) ?? null
  return (
    <Show
      when={props.options.length > 0}
      fallback={
        <div class="flex flex-col gap-1.5">
          <span class={LABEL} classList={{ "sr-only": props.labelHidden === true }}>
            {props.label}
          </span>
          <button
            type="button"
            aria-label={`${props.label}: ${props.placeholder}`}
            onClick={() => props.onEmptyPress?.()}
            onFocus={() => props.onFocus?.()}
            class={TRIGGER}
            classList={redRing(props.invalid === true)}
          >
            <span class="truncate text-text-muted">{props.placeholder}</span>
            <span class="text-text-muted">▾</span>
          </button>
        </div>
      }
    >
      <SelectPrimitive.Root<SelectOption>
        options={[...props.options]}
        optionValue="value"
        optionTextValue="label"
        value={selected()}
        onChange={(option) => {
          if (option !== null && option.value !== props.value) props.onChange(option.value)
        }}
        placeholder={props.placeholder}
        validationState={props.error === undefined ? "valid" : "invalid"}
        itemComponent={(item) => (
          <SelectPrimitive.Item
            item={item.item}
            class="flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm text-text-secondary outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-contrast"
          >
            <span class="flex min-w-0 items-center gap-2">
              {item.item.rawValue.mark?.()}
              <SelectPrimitive.ItemLabel class="truncate">{item.item.rawValue.label}</SelectPrimitive.ItemLabel>
            </span>
            <SelectPrimitive.ItemIndicator>✓</SelectPrimitive.ItemIndicator>
          </SelectPrimitive.Item>
        )}
        class="flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-1" classList={{ "sr-only": props.labelHidden === true }} on:click={pressStaysHere}>
          <SelectPrimitive.Label class={LABEL}>{props.label}</SelectPrimitive.Label>
          {props.labelMark?.()}
        </div>
        <SelectPrimitive.Trigger class={TRIGGER} classList={redRing(props.invalid === true)} onFocus={() => props.onFocus?.()}>
          <SelectPrimitive.Value<SelectOption> class="flex min-w-0 items-center gap-2 data-[placeholder-shown]:text-text-muted">
            {(state) => (
              <>
                {state.selectedOption().mark?.()}
                <span class="truncate">{state.selectedOption().label}</span>
              </>
            )}
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon class="text-text-muted">▾</SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.ErrorMessage class="text-xs text-negative">{props.error}</SelectPrimitive.ErrorMessage>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content class="z-50 rounded-md bg-surface-0 p-1 shadow-lg">
            <SelectPrimitive.Listbox class="max-h-72 overflow-y-auto" />
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </Show>
  )
}
