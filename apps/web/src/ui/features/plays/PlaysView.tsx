import { createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadPlays } from "../../../application/plays"
import type { BookId } from "../../../core/book/book"
import type { PlaySummary } from "../../../core/report/plays"
import { useApp } from "../../context"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDay } from "../../wording/dates"
import { formatCount, formatSignedYen } from "../../wording/numbers"
import { ViewHeader } from "../shell/ViewHeader"

const selectedPlay = (place: Place): string | undefined => (place.kind === "play" ? place.playId : undefined)

function PlayRow(props: { readonly play: PlaySummary; readonly selected: boolean; readonly onSelect: () => void }): JSX.Element {
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
          <span class="truncate text-text-primary">{props.play.machine ?? props.play.description}</span>
          <span class="text-xs text-text-muted">{formatDay(props.play.date)}</span>
        </div>
        <div class="flex flex-col items-end text-sm tabular-nums text-text-secondary">
          <Show when={props.play.theoreticalValue} keyed>
            {(value) => <span>期待値 {formatSignedYen(value)}</span>}
          </Show>
        </div>
      </button>
    </li>
  )
}

/** The plays the query matches, newest first. Choosing one opens its detail beside the list. */
export function PlaysView(props: { readonly place: Place; readonly bookId: BookId; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [plays] = createResource(
    () => ({ bookId: props.bookId, query: props.query, revision: app.revision() }),
    (source) => loadPlays(app.services.session, source.bookId, source.query, 0),
  )

  return (
    <MainContent header={<ViewHeader place={props.place} title="稼働" />}>
      <div class="max-w-5xl">
        <Loaded outcome={plays()}>
          {(found) => (
            <Show
              when={found.plays.length > 0}
              fallback={<EmptyState title="稼働はまだありません">稼働の横の「＋」（記録を追加）から最初の稼働を記録できます。</EmptyState>}
            >
              <div class="flex flex-col gap-2 p-2">
                <p class="px-3 pt-2 text-xs text-text-muted">
                  {found.plays.length < found.total
                    ? `新しい順に${formatCount(found.plays.length)}件を表示（全${formatCount(found.total)}件）`
                    : `全${formatCount(found.total)}件`}
                </p>
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
              </div>
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
