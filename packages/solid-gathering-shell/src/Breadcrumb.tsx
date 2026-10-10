import { For, Show, type JSX } from "solid-js"

/** One step of a trail: a label, and how to go back to it if it is not where you are. */
export interface Crumb {
  readonly label: string
  readonly onSelect?: () => void
}

/**
 * Where the main content is, as the steps that led there — a list, an item
 * in it, a part of that item. The last step is the current one; earlier
 * steps go back. Long labels shorten before the current one does, and the
 * current one shortens only once they have given all they have. Set at
 * the size of a one-level title — 13px on a phone, 14px wider — so going a
 * level deeper does not change how the header reads.
 */
export function Breadcrumb(props: { readonly label: string; readonly items: readonly Crumb[] }): JSX.Element {
  const last = (): number => props.items.length - 1
  return (
    <nav aria-label={props.label} class="min-w-0 flex-1">
      <ol class="flex min-w-0 items-center gap-1.5 text-[13px] sm:text-sm">
        <For each={props.items}>
          {(item, index) => (
            <li class="flex min-w-0 items-center gap-1.5" classList={{ "shrink-[999]": index() !== last() }}>
              <Show when={index() > 0}>
                <span aria-hidden="true" class="text-text-muted">
                  ›
                </span>
              </Show>
              <Show
                when={index() !== last() && item.onSelect}
                keyed
                fallback={
                  <span class="truncate font-semibold text-text-primary" aria-current={index() === last() ? "page" : undefined}>
                    {item.label}
                  </span>
                }
              >
                {(select) => (
                  <button type="button" onClick={() => select()} class="truncate text-text-muted hover:text-text-primary hover:underline">
                    {item.label}
                  </button>
                )}
              </Show>
            </li>
          )}
        </For>
      </ol>
    </nav>
  )
}
