import * as PopoverPrimitive from "@kobalte/core/popover"
import { createEffect, For, Show, type JSX } from "solid-js"

import { buttonVariants } from "./button"
import { isNarrowed, isTicked, tickedAll, tickedOne, tickStateOf, type Chosen } from "./choice"
import { cn } from "./cn"
import { CloseIcon, FilterIcon } from "./icons"

/** The outline of a filter's button: drawn darker while it holds something back. */
export const filterButtonClass = (narrowed: boolean): string => cn(buttonVariants({ variant: "outline", size: "icon" }), "relative shrink-0 [&_svg]:size-5", narrowed && "border-text-secondary text-text-primary")

/**
 * What a filter's button shows: a hollow funnel while everything passes
 * through, and, while something is held back, the funnel filled in and a
 * dot at its top right, so a part is not taken for the whole.
 */
export function FilterMark(props: { readonly narrowed: boolean }): JSX.Element {
  return (
    <>
      <FilterIcon filled={props.narrowed} />
      <Show when={props.narrowed}>
        <span aria-hidden="true" class="absolute -right-1 -top-1 size-2.5 rounded-full bg-text-primary ring-2 ring-surface-2" />
      </Show>
    </>
  )
}

/** One thing a filter offers: its key, what it is called, and what is said under it, if anything. */
export interface Offered {
  readonly key: string
  readonly label: string
  readonly note?: string | undefined
}

/**
 * A filter's ticks: one for all of them at the top, which ticks every one
 * or clears every one and stands mixed while some are ticked, and under it
 * one for each thing offered, in the order given — so out of many, all
 * can be cleared and a few ticked again.
 */
function Ticks(props: { readonly offered: readonly Offered[]; readonly chosen: Chosen; readonly onChosen: (chosen: Chosen) => void }): JSX.Element {
  const every = (): readonly string[] => props.offered.map((each) => each.key)
  return (
    <ul class="flex max-h-[min(24rem,60vh)] flex-col gap-1 overflow-y-auto">
      <li class="border-b border-border">
        <label class="flex cursor-pointer items-center gap-2 py-2 pl-1 pr-1">
          <input
            type="checkbox"
            checked={tickStateOf(every(), props.chosen) === "all"}
            ref={(input) => createEffect(() => (input.indeterminate = tickStateOf(every(), props.chosen) === "some"))}
            onChange={(event) => props.onChosen(tickedAll(event.currentTarget.checked))}
            class="size-5 shrink-0 accent-accent"
          />
          <span class="flex-1 text-sm font-semibold text-text-primary">すべて選択</span>
        </label>
      </li>
      <For each={props.offered}>
        {(each) => (
          <li>
            <label class="flex cursor-pointer items-start gap-2 rounded-md py-1.5 pl-1 pr-1">
              <input type="checkbox" checked={isTicked(props.chosen, each.key)} onChange={(event) => props.onChosen(tickedOne(every(), props.chosen, each.key, event.currentTarget.checked))} class="mt-0.5 size-5 shrink-0 accent-accent" />
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="break-words text-sm font-medium" classList={{ "text-text-primary": isTicked(props.chosen, each.key), "text-text-muted": !isTicked(props.chosen, each.key) }}>
                  {each.label}
                </span>
                <Show when={isTicked(props.chosen, each.key) ? each.note : undefined} keyed>
                  {(note) => <span class="text-xs text-negative">{note}</span>}
                </Show>
              </div>
            </label>
          </li>
        )}
      </For>
    </ul>
  )
}

/**
 * A filter behind a funnel: pressed, it opens beside the button with a
 * tick for each thing offered, and what is ticked is handed on as it is
 * ticked, so the view is seen narrowing under it; where nothing is
 * offered, the button is there all the same and says why there is
 * nothing to narrow by. It stays open while
 * the view narrows, focus moving or not, until the person closes it — by
 * its cross, Escape, or a press outside it. The button's name is the
 * filter's heading. It goes at the end of a row, `class` placing it.
 */
export function TickFilter(props: {
  readonly label: string
  readonly offered: readonly Offered[]
  readonly chosen: Chosen
  readonly onChosen: (chosen: Chosen) => void
  /** What is said in place of the ticks where nothing is offered: why there is nothing to narrow by. */
  readonly none: string
  readonly class?: string
}): JSX.Element {
  return (
    <PopoverPrimitive.Root gutter={6} placement="bottom-end">
      <PopoverPrimitive.Trigger aria-label={props.label} title={props.label} class={cn(filterButtonClass(isNarrowed(props.chosen)), props.class)}>
        <FilterMark narrowed={isNarrowed(props.chosen)} />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content onFocusOutside={(event) => event.preventDefault()} class="z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 rounded-md border border-border bg-surface-1 p-3 text-sm shadow-lg outline-none">
          <div class="flex items-center gap-2">
            <PopoverPrimitive.Title class="flex-1 text-sm font-semibold text-text-primary">{props.label}</PopoverPrimitive.Title>
            <PopoverPrimitive.CloseButton aria-label="閉じる" class="-mr-1 flex size-7 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4">
              <CloseIcon label="閉じる" />
            </PopoverPrimitive.CloseButton>
          </div>
          <Show when={props.offered.length > 0} fallback={<p class="text-sm text-text-muted">{props.none}</p>}>
            <Ticks offered={props.offered} chosen={props.chosen} onChosen={props.onChosen} />
          </Show>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
