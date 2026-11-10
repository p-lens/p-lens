// After stefan-karger/solid-ui's dropdown menu, on P-Lens's tokens.

import * as DropdownMenuPrimitive from "@kobalte/core/dropdown-menu"
import { For, type JSX } from "solid-js"

import { buttonVariants } from "./button"
import { ChevronDownIcon } from "./icons"

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
        <DropdownMenuPrimitive.Content class="z-50 flex min-w-40 flex-col rounded-md border border-border bg-surface-1 p-1 shadow-lg outline-none">
          <For each={props.choices}>
            {(choice) => (
              <DropdownMenuPrimitive.Item
                onSelect={() => choice.onPress()}
                class="cursor-pointer rounded px-3 py-2 text-sm text-text-primary outline-none data-[highlighted]:bg-surface-3"
              >
                {choice.label}
              </DropdownMenuPrimitive.Item>
            )}
          </For>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
