import { createSignal, For, Show, type JSX } from "solid-js"

import { tidyTyped } from "../../core/text/tidy"
import { cn } from "./cn"
import { CloseIcon } from "./icons"

/**
 * Words put on something, each a chip with a cross that takes it off, and a
 * field where another is typed — put on by Enter, a comma, or leaving the
 * field, so a word typed and not yet put on is not lost to a press
 * elsewhere — with every word offered under it, a press each, only
 * those matching what is typed where something is. A word already on is
 * not put on again nor offered. The field and the words offered are two
 * parts side by side, each placed by the class given it, so that a narrow
 * field can have the offered words run the whole width under it.
 */
export function TagsField(props: {
  readonly label: string
  readonly tags: readonly string[]
  readonly onChange: (tags: readonly string[]) => void
  readonly offered: readonly string[]
  readonly placeholder: string
  /** The most characters a word may be typed to; none for no bound. */
  readonly maxLength?: number
  /** Where the field stands among what is around it. */
  readonly fieldClass?: string
  /** Where the words offered stand among what is around them. */
  readonly offeredClass?: string
}): JSX.Element {
  const [typed, setTyped] = createSignal("")
  const put = (text: string): void => {
    const tag = tidyTyped(text)
    setTyped("")
    if (tag !== "" && !props.tags.includes(tag)) props.onChange([...props.tags, tag])
  }
  const takeOff = (tag: string): void => props.onChange(props.tags.filter((each) => each !== tag))
  const shown = (): readonly string[] => props.offered.filter((tag) => !props.tags.includes(tag) && (typed().trim() === "" || tag.includes(tidyTyped(typed()))))
  const keyDown = (event: KeyboardEvent & { readonly currentTarget: HTMLInputElement }): void => {
    if (event.isComposing || (event.key !== "Enter" && event.key !== "," && event.key !== "、")) return
    event.preventDefault()
    put(event.currentTarget.value)
  }
  return (
    <>
      <div class={cn("flex min-w-0 flex-col gap-1.5", props.fieldClass)}>
        <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">{props.label}</span>
        <div class="flex min-h-10 flex-wrap items-center gap-1 rounded-[3px] bg-surface-input px-2 py-1 focus-within:outline-2 focus-within:outline-focus-ring">
          <For each={props.tags}>
            {(tag) => (
              <span class="flex h-7 items-center gap-0.5 rounded bg-surface-3 pl-2 pr-0.5 text-sm text-text-primary">
                {tag}
                <button type="button" class="flex size-6 items-center justify-center rounded text-text-muted hover:text-text-primary [&_svg]:size-3.5" onClick={() => takeOff(tag)}>
                  <CloseIcon label={`${tag} を外す`} />
                </button>
              </span>
            )}
          </For>
          <input
            aria-label={props.label}
            value={typed()}
            onInput={(event) => setTyped(event.currentTarget.value)}
            onKeyDown={keyDown}
            onBlur={(event) => put(event.currentTarget.value)}
            placeholder={props.tags.length === 0 ? props.placeholder : ""}
            maxLength={props.maxLength}
            enterkeyhint="done"
            autocomplete="off"
            class="h-8 min-w-20 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
      </div>
      <Show when={shown().length > 0}>
        <div class={cn("flex flex-wrap gap-1", props.offeredClass)}>
          <For each={shown()}>
            {(tag) => (
              <button type="button" class="h-7 rounded border border-border px-2 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary" onMouseDown={(event) => event.preventDefault()} onClick={() => put(tag)}>
                {tag}
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}
