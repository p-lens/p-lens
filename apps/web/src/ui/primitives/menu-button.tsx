// After stefan-karger/solid-ui's dropdown menu, on P-Lens's tokens.

import * as DropdownMenuPrimitive from "@kobalte/core/dropdown-menu"
import { For, type JSX } from "solid-js"

import { buttonVariants } from "./button"
import { ChevronDownIcon, SwapIcon } from "./icons"

const MENU_CONTENT = "z-50 flex flex-col rounded-md border border-border bg-surface-1 p-1 shadow-lg outline-none"

const MENU_ITEM = "cursor-pointer rounded px-3 py-2 text-sm text-text-primary outline-none data-[highlighted]:bg-surface-3"

/** One choice of a menu: its words, and what pressing it does. */
export interface MenuChoice {
  readonly label: string
  readonly onPress: () => void
}

/**
 * A small button its words wide, with an arrow head pointing down after
 * them, that opens a list of choices under its end, each done on a press;
 * a press outside, or Escape, closes it having done nothing. For a few
 * ways of doing one thing, where buttons side by side would not fit.
 */
export function MenuButton(props: { readonly label: string; readonly choices: readonly MenuChoice[] }): JSX.Element {
  return (
    <DropdownMenuPrimitive.Root gutter={4} placement="bottom-end">
      <DropdownMenuPrimitive.Trigger class={buttonVariants({ variant: "outline", size: "small", class: "shrink-0 gap-1" })}>
        {props.label}
        <ChevronDownIcon />
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content class={`${MENU_CONTENT} min-w-40`}>
          <For each={props.choices}>
            {(choice) => (
              <DropdownMenuPrimitive.Item onSelect={() => choice.onPress()} class={MENU_ITEM}>
                {choice.label}
              </DropdownMenuPrimitive.Item>
            )}
          </For>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}

/**
 * Words in the accent's ink with a sign of changing before them, sitting
 * in a line of text, that open a list of choices under them, each done on
 * a press: for changing what the line says to one of a few things.
 */
export function ChangeMenuButton(props: { readonly label: string; readonly choices: readonly MenuChoice[] }): JSX.Element {
  return (
    <DropdownMenuPrimitive.Root gutter={4} placement="bottom-start">
      <DropdownMenuPrimitive.Trigger class="inline-flex shrink-0 items-center gap-0.5 rounded-[3px] text-xs text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-3.5">
        <SwapIcon />
        {props.label}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content class={`${MENU_CONTENT} min-w-24`}>
          <For each={props.choices}>
            {(choice) => (
              <DropdownMenuPrimitive.Item onSelect={() => choice.onPress()} class={MENU_ITEM}>
                {choice.label}
              </DropdownMenuPrimitive.Item>
            )}
          </For>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
