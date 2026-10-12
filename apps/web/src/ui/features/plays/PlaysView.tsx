import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadPlays } from "../../../application/plays"
import type { BookId } from "../../../core/book/book"
import type { ListedPlay } from "../../../core/report/plays"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { CloseIcon, FilterIcon } from "../../primitives/icons"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDay } from "../../wording/dates"
import { formatCount, formatSignedYen, formatTheoreticalYen, toneOf, UNSEEN_ACTUAL, UNSEEN_THEORETICAL } from "../../wording/numbers"
import { playTitle } from "../../wording/plays"
import { PeriodPicker } from "../period/PeriodPicker"
import { ViewHeader } from "../shell/ViewHeader"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

const selectedPlay = (place: Place): string | undefined => (place.kind === "play" ? place.playId : undefined)

/**
 * One play of the list: what it is and its day, and at the row's end what
 * it made, in the colour of which way it went, over what it was worth by
 * its formula, which has none. A play hledger could not value, and one
 * with no theoretical value written, each keeps the
 * figure's shape with nothing in it.
 */
function PlayRow(props: { readonly play: ListedPlay; readonly selected: boolean; readonly onSelect: () => void }): JSX.Element {
  return (
    <li>
      <button
        type="button"
        aria-current={props.selected ? "true" : undefined}
        onClick={() => props.onSelect()}
        class="flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-colors"
        classList={{ "bg-surface-3": props.selected, "hover:bg-surface-3/60": !props.selected }}
      >
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-text-primary">{playTitle(props.play)}</span>
          <span class="text-xs text-text-muted">{formatDay(props.play.date)}</span>
        </div>
        <div class="flex flex-col items-end text-sm tabular-nums text-text-secondary">
          <Show when={props.play.actual} keyed fallback={<span class="text-text-muted">実収支 {UNSEEN_ACTUAL}</span>}>
            {(actual) => <span class={TONES[toneOf(actual)]}>実収支 {formatSignedYen(actual)}</span>}
          </Show>
          <Show when={props.play.theoreticalValue} keyed fallback={<span class="text-text-muted">期待値 {UNSEEN_THEORETICAL}</span>}>
            {(value) => <span>期待値 {formatTheoreticalYen(value)}</span>}
          </Show>
        </div>
      </button>
    </li>
  )
}

const FILTER = "絞り込み"

/**
 * The plays the query matches, newest first. Choosing one opens its detail
 * beside the list. The funnel at the end of the count's row — the list's
 * own width, not the window's — brings out the filter: a card above the
 * list holding the period, chosen as two days as a breakdown's is and
 * written into the address as the same query. The card stays out until
 * its cross is pressed, so the list is seen narrowing under it, and 解除
 * at its end takes every narrowing off at once. While the
 * list is narrowed the funnel is filled in and wears a dot, so a part is
 * not taken for all the plays there are.
 */
export function PlaysView(props: { readonly place: Place; readonly bookId: BookId; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [plays] = createResource(
    () => ({ bookId: props.bookId, query: props.query, revision: app.revision() }),
    (source) => loadPlays(app.services.session, source.bookId, source.query, 0),
  )
  /** Whether the filter's card is out: it stays above the list until its cross, or the funnel, is pressed, whatever is chosen in it. */
  const [filtering, setFiltering] = createSignal(false)
  const narrowed = (): boolean => props.query !== ""
  /** How many plays are listed, of how many there are: nothing while they are awaited or could not be read, which is said below. */
  const countText = (): string => ((found) => (found?.ok !== true ? "" : found.value.plays.length < found.value.total ? `新しい順に${formatCount(found.value.plays.length)}件を表示（全${formatCount(found.value.total)}件）` : `全${formatCount(found.value.total)}件`))(plays())

  return (
    <MainContent header={<ViewHeader place={props.place} title="稼働" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-2 p-2">
          <div class="flex items-center justify-between gap-2 pl-3 pr-1 pt-1">
            <p class="text-xs text-text-muted">{countText()}</p>
            <Button type="button" variant="outline" size="icon" aria-label={FILTER} title={FILTER} aria-expanded={filtering()} onClick={() => setFiltering((open) => !open)} class={`relative shrink-0 [&_svg]:size-5 ${narrowed() ? "border-text-secondary text-text-primary" : ""}`}>
              <FilterIcon filled={narrowed()} />
              <Show when={narrowed()}>
                <span aria-hidden="true" class="absolute -right-1 -top-1 size-2.5 rounded-full bg-text-primary ring-2 ring-surface-2" />
              </Show>
            </Button>
          </div>
          <Show when={filtering()}>
            <section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-3" aria-label={FILTER}>
              <div class="flex items-center gap-2">
                <h2 class="flex-1 text-sm font-semibold text-text-primary">{FILTER}</h2>
                <button type="button" class="-mr-1 flex size-7 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4" onClick={() => setFiltering(false)}>
                  <CloseIcon label="絞り込みを閉じる" />
                </button>
              </div>
              <div class="flex flex-wrap items-end gap-3">
                <PeriodPicker query={props.query} today={app.services.businessDay()} onTyped={(query) => moves.refine(props.place, query)} onPressed={(query) => moves.go(props.place, query)} />
                <Button type="button" variant="outline" class="ml-auto" onClick={() => moves.go(props.place, "")}>
                  解除
                </Button>
              </div>
            </section>
          </Show>
          <Loaded outcome={plays()}>
            {(found) => (
              <Show
                when={found.plays.length > 0}
                fallback={
                  <Show when={props.query === ""} fallback={<EmptyState title="この期間の稼働はありません" />}>
                    <EmptyState title="稼働はまだありません">稼働の横の「＋」（記録を追加）から最初の稼働を記録できます。</EmptyState>
                  </Show>
                }
              >
                <ul class="flex flex-col gap-0.5">
                  <For each={found.plays}>
                    {(play) => (
                      <PlayRow
                        play={play}
                        selected={selectedPlay(props.place) === play.id}
                        onSelect={() => moves.go({ kind: "play", bookId: props.bookId, playId: play.id }, props.query)}
                      />
                    )}
                  </For>
                </ul>
              </Show>
            )}
          </Loaded>
        </div>
      </div>
    </MainContent>
  )
}
