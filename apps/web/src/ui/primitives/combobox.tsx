// After stefan-karger/solid-ui's combobox, on P-Lens's tokens.

import * as ComboboxPrimitive from "@kobalte/core/combobox"
import { createMemo, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"

import { redRing } from "./nudge"
import { onShownAgain } from "./shown-again"
import { createTypedOver } from "./typed-over"
import { createDebounced } from "./debounce"

/** One choice: `value` is what is chosen; `label` is how the list and the input say it; `note` is said of it in the list alone, small at the far end of its row — how far it is, say. */
export interface ComboboxOption {
  readonly value: string
  readonly label: string
  readonly note?: string
  /** Comes ahead of the rest among what a search finds, whatever the order given: one a search is most likely for. */
  readonly foundFirst?: boolean
}

/** Whether a field holds text that chose nothing: something typed that is not the label of what is chosen. What was typed stays when the field is left, so whoever asks can refuse it. */
export const holdsTypedOnly = (typed: string, chosen: string | undefined): boolean => typed.trim() !== "" && typed.trim() !== chosen

/**
 * How many choices the list shows, of those in the order given — nearest
 * first, say: the first so many before anything is typed, and as many of
 * what a search finds. Those that come first among what a search finds are
 * all shown ahead of them, however many: they are what the search is for,
 * and typing more narrows them.
 */
const MOST_OFFERED = 20

/**
 * A select box that is searched by typing: the list narrows to what matches
 * the text, and choosing fills the input. Clearing the input chooses nothing.
 *
 * Thousands of choices are searched here, not drawn: only some of those
 * that match are ever in the list, so the matching is done here and the
 * list handed over already narrowed. The input holding the chosen one's
 * own label is no search: the list then opens as it would empty. Coming
 * back to the input selects what it holds, so typing starts a new search
 * at once. Text still being composed — kana on its way to kanji — is not
 * searched for until it is settled: the list waits for the word, faded,
 * and the field turns a wheel where its arrow was. Typing is
 * debounced: the list follows once the typing has stood still, not key by key.
 *
 * Choosing is the end of what the input was for, so it lets go of the
 * focus: left in it, the chosen label would stand selected, a phone's
 * keyboard up over the rest of the form. The list closing hands the focus
 * to nothing either: it never left the input while the list was open. And like a text field, it has
 * what it holds written back whenever the page is before the person again,
 * a browser having emptied the input while they were away.
 */
export function Combobox(props: {
  readonly label: string
  readonly options: readonly ComboboxOption[]
  readonly value: string | undefined
  readonly onChange: (value: string | undefined) => void
  readonly placeholder: string
  readonly error?: string | undefined
  /** Whether a choice is found by what was typed; without it, by its label holding the text. */
  readonly matches?: (value: string, typed: string) => boolean
  /** Marked as wrong without a word, as a field is after a press that needed it. */
  readonly invalid?: boolean
  readonly onFocus?: () => void
  /** Takes the focus as it appears, its list open: it was brought up by a press that asked to choose. */
  readonly focusedAtOnce?: boolean
  /** Told what the input holds as it changes: what was typed stays when the input is left, chosen or not, so whoever asks can tell text that chose nothing. */
  readonly onTyped?: (typed: string) => void
}): JSX.Element {
  /** Kobalte takes `null` for nothing chosen; it goes no further than this call. */
  const selected = createMemo((): ComboboxOption | null => props.options.find((option) => option.value === props.value) ?? null)
  const [typed, setTyped] = createSignal("")
  const held: { input: HTMLInputElement | undefined } = { input: undefined }
  const leaveOnceChosen = (): void => void setTimeout(() => held.input?.blur())
  const [composing, setComposing] = createSignal(false)
  onMount(() => {
    if (props.focusedAtOnce === true) held.input?.focus()
  })
  onCleanup(
    onShownAgain(() => {
      if (held.input !== undefined && !composing() && held.input.value !== typed()) held.input.value = typed()
    }),
  )
  const over = createTypedOver(() => true)
  const sought = createDebounced((): string => (typed() === selected()?.label ? "" : typed()))
  const found = (option: ComboboxOption, text: string): boolean => (props.matches === undefined ? option.label.includes(text) : props.matches(option.value, text))
  const shown = createMemo((): ComboboxOption[] => {
    const text = sought()
    const matching = props.options.filter((option) => found(option, text))
    const first =
      text.trim() === ""
        ? matching.slice(0, MOST_OFFERED)
        : [...matching.filter((option) => option.foundFirst === true), ...matching.filter((option) => option.foundFirst !== true).slice(0, MOST_OFFERED)]
    const chosen = selected()
    return chosen === null || first.some((option) => option.value === chosen.value) ? first : [chosen, ...first]
  })
  return (
    <ComboboxPrimitive.Root<ComboboxOption>
      options={shown()}
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      value={selected()}
      onChange={(option) => {
        props.onChange(option?.value)
        if (option !== null) leaveOnceChosen()
      }}
      onInputChange={(text) => {
        if (!composing()) setTyped(text)
        props.onTyped?.(text)
        if (text.trim() === "") props.onChange(undefined)
      }}
      placeholder={props.placeholder}
      triggerMode="focus"
      noResetInputOnBlur
      defaultFilter={() => true}
      validationState={props.error === undefined ? "valid" : "invalid"}
      itemComponent={(item) => (
        <ComboboxPrimitive.Item
          item={item.item}
          class="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-2 text-sm text-text-secondary outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-contrast"
        >
          <ComboboxPrimitive.ItemLabel class="min-w-0">{item.item.rawValue.label}</ComboboxPrimitive.ItemLabel>
          <span class="flex shrink-0 items-center gap-1.5">
            <span class="text-[11px] tabular-nums opacity-60">{item.item.rawValue.note}</span>
            <ComboboxPrimitive.ItemIndicator>✓</ComboboxPrimitive.ItemIndicator>
          </span>
        </ComboboxPrimitive.Item>
      )}
      class="flex flex-col gap-1.5"
    >
      <ComboboxPrimitive.Label as="span" class="text-xs font-bold uppercase tracking-wide text-text-secondary">{props.label}</ComboboxPrimitive.Label>
      <ComboboxPrimitive.Control
        class="flex h-10 items-center rounded-[3px] bg-surface-input focus-within:outline-2 focus-within:outline-focus-ring"
        classList={redRing(props.invalid === true)}
      >
        <ComboboxPrimitive.Input
          autocomplete="off"
          ref={(element: HTMLInputElement) => {
            held.input = element
          }}
          onFocus={(event) => {
            over.onFocus(event)
            props.onFocus?.()
          }}
          onBlur={over.onBlur}
          onPointerDown={over.onPointerDown}
          onKeyDown={over.onKeyDown}
          onBeforeInput={over.onBeforeInput}
          onCompositionStart={(event: CompositionEvent & { readonly currentTarget: HTMLInputElement }) => {
            over.onCompositionStart(event)
            setComposing(true)
          }}
          onCompositionEnd={(event: CompositionEvent & { readonly currentTarget: HTMLInputElement }) => {
            setComposing(false)
            setTyped(event.currentTarget.value)
          }}
          class="h-10 min-w-0 flex-1 px-3 text-text-primary outline-none placeholder:text-text-muted"
          classList={{ "rounded-[3px] bg-accent/30 caret-transparent": over.waiting(), "bg-transparent": !over.waiting() }}
        />
        <ComboboxPrimitive.Trigger class="px-3 text-text-muted">
          <Show when={composing()} fallback={<ComboboxPrimitive.Icon>▾</ComboboxPrimitive.Icon>}>
            <span role="status" aria-label="入力の確定を待っています" class="block size-4 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
          </Show>
        </ComboboxPrimitive.Trigger>
      </ComboboxPrimitive.Control>
      <ComboboxPrimitive.ErrorMessage class="text-xs text-negative">{props.error}</ComboboxPrimitive.ErrorMessage>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Content class="z-50 rounded-md bg-surface-0 p-1 shadow-lg" onCloseAutoFocus={(event) => event.preventDefault()}>
          <ComboboxPrimitive.Listbox class="max-h-72 overflow-y-auto transition-opacity" classList={{ "opacity-40": composing() }} />
        </ComboboxPrimitive.Content>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}
