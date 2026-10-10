// After stefan-karger/solid-ui's text-field, on P-Lens's tokens.

import * as TextFieldPrimitive from "@kobalte/core/text-field"
import { createEffect, createSignal, on, onCleanup, Show, type JSX } from "solid-js"

import { tidyTyped } from "../../core/text/tidy"
import { redRing } from "./nudge"
import { DEBOUNCE_FOR } from "./debounce"
import { onShownAgain } from "./shown-again"
import { createTypedOver } from "./typed-over"

/**
 * Lets the field being typed in finish before a press acts on the form:
 * leaving it tidies what it holds, so a press that comes straight after
 * typing — or Enter, which leaves nothing — still acts on the tidied text.
 */
export const settleTyping = (): void => {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}

/**
 * A labelled text input. Its label is words and no more: only a press
 * on the field itself gives it the focus. Leaving it tidies what was typed (see `tidyTyped`):
 * full-width letters, digits, brackets and spaces become half-width, and the
 * ends are trimmed. A date is the browser's own and is left alone. Marked `invalid` alone it only turns red; the line
 * below appears only when there are words for it, so a nudge moves nothing.
 *
 * Typing is debounced: what is typed shows at once and is told to
 * `onChange` only once the typing has stood still. 512 passes through 5 and
 * 51, and whatever a form works out from the field is not worked out at
 * either. Nothing acts on text that is behind: Enter, or a press anywhere,
 * flushes what it holds before anything else hears of it. Leaving the field
 * while it is behind tells nothing by itself — the press that took the
 * focus would find the screen moved under it — and the text is told, and
 * tidied, when that press lands or the wait runs out. A date is chosen, not
 * typed, and is told at once.
 *
 * Nothing typed here is a password, a card or an address, and it says so
 * to the browser, so a phone's keyboard offers none of them. A browser that
 * is told so may empty the field while the person is away at another site
 * — WebKit does — though what the field holds is still held here: so
 * whenever the page is before the person again, the field is written back.
 */
export function TextField(props: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly type?: "text" | "date"
  readonly inputMode?: "text" | "numeric" | "decimal"
  readonly placeholder?: string
  readonly suffix?: string
  readonly error?: string | undefined
  /** Marked as wrong without a word: a required field left empty after a press. */
  readonly invalid?: boolean
  readonly required?: boolean
  readonly onFocus?: () => void
  /**
   * Whether what it holds gives way to the first key typed once it takes
   * the focus (see `createTypedOver`). A number does unless told otherwise:
   * a count is typed afresh, never mended a digit at a time. Words do not.
   */
  readonly typedOver?: boolean
  /** The most characters it takes: for a figure that is never longer. */
  readonly maxLength?: number
  /** Tighter, for a short number among others in a narrow row: four digits still fit a phone's quarter width. */
  readonly compact?: boolean
  /** How what was typed is tidied when the field is left, where the usual tidying is not all it takes: a name, written as names are kept. */
  readonly tidied?: (typed: string) => string
  /** Named for assistive technology only, where what surrounds it — a fieldset's legend, a suffix — already says it on screen. */
  readonly labelHidden?: boolean
}): JSX.Element {
  const invalid = (): boolean => props.invalid === true || props.error !== undefined
  const [typed, setTyped] = createSignal(props.value)
  const over = createTypedOver(() => props.typedOver ?? (props.inputMode === "numeric" || props.inputMode === "decimal"))
  const debounce: { timer: ReturnType<typeof setTimeout> | undefined; input: HTMLInputElement | undefined } = { timer: undefined, input: undefined }
  const tidy = (): void => {
    const tidied = (props.tidied ?? tidyTyped)(typed())
    if (props.type === "date" || tidied === typed()) return
    setTyped(tidied)
    props.onChange(tidied)
  }
  const flush = (): void => {
    if (debounce.timer === undefined) return
    clearTimeout(debounce.timer)
    debounce.timer = undefined
    document.removeEventListener("click", settle, true)
    if (typed() !== props.value) props.onChange(typed())
  }
  const settle = (): void => {
    flush()
    if (document.activeElement !== debounce.input) tidy()
  }
  const typing = (text: string): void => {
    setTyped(text)
    if (props.type === "date") {
      props.onChange(text)
      return
    }
    if (debounce.timer !== undefined) clearTimeout(debounce.timer)
    else document.addEventListener("click", settle, true)
    debounce.timer = setTimeout(settle, DEBOUNCE_FOR)
  }
  const left = (): void => {
    if (debounce.timer === undefined) tidy()
  }
  createEffect(
    on(
      () => props.value,
      (value) => {
        if (debounce.timer === undefined) setTyped(value)
      },
      { defer: true },
    ),
  )
  onCleanup(
    onShownAgain(() => {
      if (debounce.input !== undefined && debounce.input.value !== typed()) debounce.input.value = typed()
    }),
  )
  onCleanup(flush)
  return (
    <TextFieldPrimitive.Root
      value={typed()}
      onChange={typing}
      validationState={invalid() ? "invalid" : "valid"}
      required={props.required ?? false}
      class="flex flex-col gap-1.5"
    >
      <TextFieldPrimitive.Label as="span" class="text-xs font-bold uppercase tracking-wide text-text-secondary" classList={{ "sr-only": props.labelHidden === true }}>{props.label}</TextFieldPrimitive.Label>
      <div
        class="flex items-center rounded-[3px] bg-surface-input focus-within:outline-2 focus-within:outline-focus-ring"
        classList={redRing(props.invalid === true)}
      >
        <TextFieldPrimitive.Input
          type={props.type ?? "text"}
          inputMode={props.inputMode ?? "text"}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          autocomplete="off"
          onFocus={(event) => {
            over.onFocus(event)
            props.onFocus?.()
          }}
          onPointerDown={over.onPointerDown}
          onCompositionStart={over.onCompositionStart}
          onBeforeInput={over.onBeforeInput}
          ref={(element) => {
            debounce.input = element
          }}
          onBlur={() => {
            over.onBlur()
            left()
          }}
          onKeyDown={(event) => {
            over.onKeyDown(event)
            if (event.key === "Enter") flush()
          }}
          class="h-10 min-w-0 flex-1 text-text-primary outline-none placeholder:text-text-muted"
          classList={{ "px-3": props.compact !== true, "px-2 tabular-nums": props.compact === true, "rounded-[3px] bg-accent/30 caret-transparent": over.waiting(), "bg-transparent": !over.waiting() }}
        />
        <Show when={props.suffix}>
          <span class="shrink-0 text-text-muted" classList={{ "pr-3 text-sm": props.compact !== true, "pr-1.5 text-xs": props.compact === true }}>
            {props.suffix}
          </span>
        </Show>
      </div>
      <Show when={props.error !== undefined}>
        <TextFieldPrimitive.ErrorMessage class="text-xs text-negative">{props.error}</TextFieldPrimitive.ErrorMessage>
      </Show>
    </TextFieldPrimitive.Root>
  )
}
