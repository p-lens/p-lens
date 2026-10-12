import { createResource, For, Show, type JSX } from "solid-js"

import type { BookId } from "../../../core/book/book"
import { useApp } from "../../context"
import { Loaded } from "../../primitives/states"
import { bookTitle } from "../../wording/book"

/**
 * The books a consolidated view is of, each with a tick: every book on the
 * device until some are left out, which is what `undefined` says. Under a
 * book that is ticked and could not be read is why, and that what is
 * shown does not hold it. It stands under each consolidated view, so
 * which books are read is changed where their figures are.
 */
export function ConsolidatedBooks(props: { readonly bookIds: readonly BookId[] | undefined; readonly unread: (id: BookId) => string | undefined; readonly onChosen: (bookIds: readonly BookId[] | undefined) => void }): JSX.Element {
  const app = useApp()
  const [listed] = createResource(() => app.revision(), () => app.services.session.books())
  const every = (): readonly BookId[] => ((found) => (found?.ok === true ? found.value.map((book) => book.id) : []))(listed())
  const ticked = (id: BookId): boolean => props.bookIds === undefined || props.bookIds.includes(id)
  const tick = (id: BookId, on: boolean): void => {
    const next = every().filter((each) => (each === id ? on : ticked(each)))
    props.onChosen(next.length === every().length ? undefined : next)
  }
  return (
    <section class="flex flex-col gap-2">
      <h2 class="px-3 text-xs font-bold tracking-wide text-text-muted">連結する帳簿</h2>
      <Loaded outcome={listed()}>
        {(books) => (
          <ul class="flex flex-col gap-1">
            <For each={books}>
              {(book) => (
                <li class="flex items-start gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-3">
                  <input type="checkbox" aria-label={`${bookTitle(book)} を連結に入れる`} checked={ticked(book.id)} onChange={(event) => tick(book.id, event.currentTarget.checked)} class="mt-0.5 size-5 shrink-0 accent-accent" />
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="break-words text-sm font-medium" classList={{ "text-text-primary": ticked(book.id), "text-text-muted": !ticked(book.id) }}>
                      {bookTitle(book)}
                    </span>
                    <Show when={ticked(book.id) ? props.unread(book.id) : undefined} keyed>
                      {(why) => <span class="text-xs text-negative">{why}（合計に入っていません）</span>}
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        )}
      </Loaded>
    </section>
  )
}
