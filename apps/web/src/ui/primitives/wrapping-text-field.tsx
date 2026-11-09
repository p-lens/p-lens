import { createEffect, onCleanup, onMount, Show, type JSX } from "solid-js"

/** What is typed, on one line: a line break, typed or pasted, becomes a space. */
const oneLine = (text: string): string => text.replace(/\r\n|[\r\n]/g, " ")

/** The field as tall as what it holds, wrapped at its width. */
const fitHeight = (area: HTMLTextAreaElement): void => {
  area.style.height = "auto"
  area.style.height = `${area.scrollHeight}px`
}

/**
 * Words written on one line, in a field that wraps them at its width and
 * grows downwards as they run on, so that all of a long note is seen at
 * once. Enter puts no line break in: it leaves the field, as a single line's
 * does. Its height follows what it holds and its width, never anything
 * beside it. How long it runs is counted beside its label against the most
 * it takes as it is typed, so that a note running over is seen at once.
 */
export function WrappingTextField(props: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  /** How many characters it holds, as they will be kept. */
  readonly length: number
  /** The most characters it takes. */
  readonly most: number
  readonly error?: string | undefined
}): JSX.Element {
  const held: { area: HTMLTextAreaElement | undefined; width: number } = { area: undefined, width: 0 }
  const fit = (): void => {
    if (held.area !== undefined) fitHeight(held.area)
  }
  const input = (event: InputEvent & { readonly currentTarget: HTMLTextAreaElement }): void => {
    const text = oneLine(event.currentTarget.value)
    if (text !== event.currentTarget.value) event.currentTarget.value = text
    fit()
    props.onChange(text)
  }
  const keyDown = (event: KeyboardEvent & { readonly currentTarget: HTMLTextAreaElement }): void => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    event.currentTarget.blur()
  }
  createEffect(() => {
    if (held.area !== undefined && held.area.value !== props.value) held.area.value = props.value
    fit()
  })
  onMount(() => {
    if (held.area === undefined) return
    const watched = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0
      if (width === held.width) return
      held.width = width
      fit()
    })
    watched.observe(held.area)
    onCleanup(() => watched.disconnect())
  })
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">{props.label}</span>
        <span class="text-xs tabular-nums" classList={{ "text-negative": props.length > props.most, "text-text-muted": props.length <= props.most }} aria-hidden="true">
          {props.length}/{props.most}
        </span>
      </div>
      <div class="flex rounded-[3px] bg-surface-input focus-within:outline-2 focus-within:outline-focus-ring">
        <textarea
          ref={(element) => {
            held.area = element
          }}
          aria-label={props.label}
          aria-invalid={props.error !== undefined}
          rows={1}
          value={props.value}
          onInput={input}
          onKeyDown={keyDown}
          placeholder={props.placeholder}
          enterkeyhint="done"
          autocomplete="off"
          class="block min-h-10 min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-3 py-2 text-base leading-6 text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>
      <Show when={props.error} keyed>
        {(error) => <p class="text-xs text-negative">{error}</p>}
      </Show>
    </div>
  )
}
