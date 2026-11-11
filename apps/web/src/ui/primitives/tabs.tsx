// After stefan-karger/solid-ui's tabs, on P-Lens's tokens.

import * as TabsPrimitive from "@kobalte/core/tabs"
import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"

import { MoreAfterIcon, MoreBeforeIcon } from "./icons"

/**
 * One choice of a few ways to do the same thing, as folder tabs along the
 * top: the chosen one stands out of the strip and runs into the page below,
 * and a strip with more than it holds scrolls sideways.
 * The panels may sit anywhere inside, below the tabs.
 */
export function Tabs(props: { readonly value: string; readonly onChange: (value: string) => void; readonly label: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <TabsPrimitive.Root value={props.value} onChange={props.onChange} aria-label={props.label} class="flex flex-col">
      {props.children}
    </TabsPrimitive.Root>
  )
}

/** Which ends of a strip of tabs have more beyond them, out of view. */
interface Beyond {
  readonly start: boolean
  readonly end: boolean
}

const NONE_BEYOND: Beyond = { start: false, end: false }

/** How far short of an end still counts as at it, in pixels: a scroll can stop a hair short. */
const AT_THE_END = 2

const beyondOf = (strip: HTMLElement): Beyond => ({ start: strip.scrollLeft > AT_THE_END, end: strip.scrollWidth - strip.clientWidth - strip.scrollLeft > AT_THE_END })

/** How much of the strip's width a press of its arrow moves it by: most of a view, so the tab cut at its edge is still in sight. */
const PRESSED_STEP = 0.7

/**
 * The end of a strip with more beyond it: the strip fading out under it, so
 * the tab cut there is seen to go on, and an arrow pressed to bring more in.
 * It stops short of the strip's foot, whose line runs on under it. The arrow
 * is for a pointer: the keys move along the tabs, which bring each into view.
 */
function MoreBeyond(props: { readonly side: "start" | "end"; readonly onPress: () => void }): JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      class="absolute top-0 bottom-px flex w-10 items-center pt-2 text-text-muted hover:text-text-primary [&_svg]:size-4"
      classList={{ "left-0 justify-start bg-linear-to-r from-surface-1 from-40% to-transparent pl-1": props.side === "start", "right-0 justify-end bg-linear-to-l from-surface-1 from-40% to-transparent pr-1": props.side === "end" }}
      onClick={() => props.onPress()}
    >
      {props.side === "start" ? <MoreBeforeIcon /> : <MoreAfterIcon />}
    </button>
  )
}

/**
 * The strip the tabs stand in, scrolled sideways where they are more than
 * its width holds, as on a phone: each end with more beyond it fades out
 * under an arrow, and none shows a scrollbar. Its foot's line is drawn
 * inside it, under the tabs, so the chosen tab runs into the page below
 * however far the strip is scrolled.
 */
export function TabsList(props: { readonly children: JSX.Element }): JSX.Element {
  const held: { strip: HTMLElement | undefined } = { strip: undefined }
  const [beyond, setBeyond] = createSignal<Beyond>(NONE_BEYOND)
  const measured = (): void => void setBeyond(held.strip === undefined ? NONE_BEYOND : beyondOf(held.strip))
  const moved = (side: "start" | "end"): void => held.strip?.scrollBy({ left: (side === "start" ? -1 : 1) * held.strip.clientWidth * PRESSED_STEP, behavior: "smooth" })
  onMount(() => {
    const strip = held.strip
    if (strip === undefined) return
    const watched = new ResizeObserver(measured)
    watched.observe(strip)
    onCleanup(() => watched.disconnect())
  })
  return (
    <div class="relative bg-surface-1">
      <div ref={(element) => (held.strip = element)} class="overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onScroll={measured}>
        <TabsPrimitive.List class="flex w-max min-w-full items-end gap-1 px-2 pt-2 @roomy:px-4">{props.children}</TabsPrimitive.List>
      </div>
      <Show when={beyond().start}>
        <MoreBeyond side="start" onPress={() => moved("start")} />
      </Show>
      <Show when={beyond().end}>
        <MoreBeyond side="end" onPress={() => moved("end")} />
      </Show>
    </div>
  )
}

/** A tab, with a mark before its name where it has one: the mark the thing it leads to is known by elsewhere. */
export function TabsTrigger(props: { readonly value: string; readonly icon?: JSX.Element; readonly children: JSX.Element }): JSX.Element {
  return (
    <TabsPrimitive.Trigger
      value={props.value}
      class="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border border-transparent px-2.5 text-sm @roomy:px-4 font-medium text-text-muted transition-colors hover:bg-surface-3/40 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring data-[selected]:border-border data-[selected]:border-b-surface-2 data-[selected]:bg-surface-2 data-[selected]:text-text-primary"
    >
      <Show when={props.icon}>
        <span class="flex shrink-0 [&_svg]:size-4" aria-hidden="true">
          {props.icon}
        </span>
      </Show>
      {props.children}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent(props: { readonly value: string; readonly class?: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <TabsPrimitive.Content value={props.value} class={props.class}>
      {props.children}
    </TabsPrimitive.Content>
  )
}
