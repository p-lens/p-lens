// After stefan-karger/solid-ui's tabs, on P-Lens's tokens.

import * as TabsPrimitive from "@kobalte/core/tabs"
import { Show, type JSX } from "solid-js"

/**
 * One choice of a few ways to do the same thing, as folder tabs along the
 * top: the chosen one stands out of the strip and runs into the page below.
 * The panels may sit anywhere inside, below the tabs.
 */
export function Tabs(props: { readonly value: string; readonly onChange: (value: string) => void; readonly label: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <TabsPrimitive.Root value={props.value} onChange={props.onChange} aria-label={props.label} class="flex flex-col">
      {props.children}
    </TabsPrimitive.Root>
  )
}

export function TabsList(props: { readonly children: JSX.Element }): JSX.Element {
  return <TabsPrimitive.List class="flex items-end gap-1 border-b border-border bg-surface-1 px-2 pt-2 sm:px-4">{props.children}</TabsPrimitive.List>
}

/** A tab, with a mark before its name where it has one: the mark the thing it leads to is known by elsewhere. */
export function TabsTrigger(props: { readonly value: string; readonly icon?: JSX.Element; readonly children: JSX.Element }): JSX.Element {
  return (
    <TabsPrimitive.Trigger
      value={props.value}
      class="-mb-px flex h-9 items-center gap-1.5 whitespace-nowrap rounded-t-md border border-transparent px-2.5 text-sm sm:px-4 font-medium text-text-muted transition-colors hover:bg-surface-3/40 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring data-[selected]:border-border data-[selected]:border-b-surface-2 data-[selected]:bg-surface-2 data-[selected]:text-text-primary"
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
