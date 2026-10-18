import { Match, Show, Switch, type JSX } from "solid-js"

import type { Outcome } from "../../application/errors"
import { describeError } from "../wording/errors"
import { createWait } from "./wait"

/** What is shown while something is on its way. */
export function Loading(): JSX.Element {
  return (
    <p class="px-4 py-6 text-sm text-text-muted" role="status">
      読み込み中…
    </p>
  )
}

/**
 * An answer that may not have arrived yet, drawn in each of its three states:
 * waiting, failed with what went wrong, or ready. A wait too short to
 * notice is passed over in silence, and one that is shown stays long enough
 * to be read, so an answer a moment away does not flash a sign on its way.
 */
export function Loaded<T>(props: {
  readonly outcome: Outcome<T> | undefined
  readonly children: (value: T) => JSX.Element
}): JSX.Element {
  const wait = createWait(() => props.outcome === undefined)
  return (
    <Switch>
      <Match when={wait().type === "shown"}>
        <Loading />
      </Match>
      <Match when={wait().type === "quiet"}>{undefined}</Match>
      <Match when={props.outcome?.ok === false && props.outcome.error} keyed>
        {(error) => (
          <div role="alert" class="m-4 rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
            {describeError(error)}
          </div>
        )}
      </Match>
      <Match when={props.outcome?.ok === true && props.outcome} keyed>
        {(ready) => props.children(ready.value)}
      </Match>
    </Switch>
  )
}

/**
 * Something shown while a new answer for it is on its way: left where it
 * is, faded, with the sign of waiting laid over it — so a screen asked
 * anew, for another period or another month, keeps its shape rather than
 * going blank. A wait too short to notice is passed over in silence.
 */
export function Refreshing(props: { readonly loading: boolean; readonly children: JSX.Element }): JSX.Element {
  const wait = createWait(() => props.loading)
  return (
    <div class="relative">
      <div class="transition-opacity" classList={{ "opacity-40": wait().type === "shown" }}>
        {props.children}
      </div>
      <Show when={wait().type === "shown"}>
        <div class="absolute inset-0 flex items-start justify-center pt-16">
          <p class="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-secondary shadow-lg" role="status">
            読み込み中…
          </p>
        </div>
      </Show>
    </div>
  )
}

/** What a list or a screen says when it has nothing to show. */
export function EmptyState(props: { readonly title: string; readonly children?: JSX.Element }): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p class="font-semibold text-text-primary">{props.title}</p>
      <div class="max-w-sm text-sm text-text-muted">{props.children}</div>
    </div>
  )
}
