import { For, Show, type JSX } from "solid-js"

import { Tooltip, TooltipContent, TooltipTrigger } from "../../primitives/tooltip"

/** A second thing a row can do, beside opening it: shown as an icon, named by its tooltip. */
export interface SideListAction {
  readonly label: string
  readonly icon: JSX.Element
  readonly onSelect: () => void
}

export interface SideListItem {
  readonly id: string
  readonly label: string
  readonly icon?: JSX.Element
  readonly selected: boolean
  readonly onSelect: () => void
  readonly action?: SideListAction
}

/** One group of choices in the side panel, under its heading where it has one. */
export function SideList(props: { readonly heading?: string; readonly items: readonly SideListItem[]; readonly empty?: string }): JSX.Element {
  return (
    <section class="px-2 pt-4">
      <Show when={props.heading} keyed>
        {(heading) => <h2 class="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-text-muted">{heading}</h2>}
      </Show>
      {props.items.length === 0 && props.empty !== undefined ? (
        <p class="px-2 py-1.5 text-sm text-text-muted">{props.empty}</p>
      ) : (
        <ul class="flex flex-col gap-0.5">
          <For each={props.items}>
            {(item) => (
              <li
                class="flex items-center rounded transition-colors"
                classList={{
                  "bg-surface-3 text-text-primary": item.selected,
                  "text-text-muted hover:bg-surface-3/60 hover:text-text-secondary": !item.selected,
                }}
              >
                <button
                  type="button"
                  aria-current={item.selected ? "page" : undefined}
                  onClick={() => item.onSelect()}
                  class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[15px] [&_svg]:size-5"
                >
                  {item.icon}
                  <span class="truncate">{item.label}</span>
                </button>
                <Show when={item.action} keyed>
                  {(action) => (
                    <Tooltip placement="top">
                      <TooltipTrigger
                        as="button"
                        type="button"
                        aria-label={action.label}
                        onClick={() => action.onSelect()}
                        class="mr-1 flex size-7 shrink-0 items-center justify-center rounded border border-border text-text-secondary hover:border-text-secondary hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4"
                      >
                        {action.icon}
                      </TooltipTrigger>
                      <TooltipContent>{action.label}</TooltipContent>
                    </Tooltip>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
      )}
    </section>
  )
}
