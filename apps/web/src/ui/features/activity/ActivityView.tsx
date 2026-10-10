import { createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadActivity } from "../../../application/activity"
import type { Book, BookId } from "../../../core/book/book"
import type { ActivityLine } from "../../../core/activity/activity"
import { useApp } from "../../context"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { describeActivity } from "../../wording/activity"
import { formatMoment } from "../../wording/dates"
import { formatSignedYen } from "../../wording/numbers"
import { ViewHeader } from "../shell/ViewHeader"

const authorName = (book: Book | undefined, line: ActivityLine): string => book?.members.find((member) => member.id === line.by)?.displayName ?? line.by

function ActivityRow(props: { readonly line: ActivityLine; readonly author: string; readonly onOpenPlay: (() => void) | undefined }): JSX.Element {
  return (
    <li class="flex gap-3 rounded px-3 py-2 hover:bg-surface-3/40">
      <time class="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-text-muted" datetime={props.line.at}>
        {formatMoment(props.line.at)}
      </time>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-semibold text-text-primary">{props.author}</span>
        <span class="text-sm text-text-secondary">{describeActivity(props.line)}</span>
        <Show when={props.line.parts.theoretical} keyed>
          {(theoretical) => <span class="text-xs text-text-muted">期待値 {formatSignedYen(theoretical.value)}</span>}
        </Show>
      </div>
      <Show when={props.onOpenPlay} keyed>
        {(open) => (
          <button type="button" class="self-center text-sm text-accent hover:underline" onClick={() => open()}>
            開く
          </button>
        )}
      </Show>
    </li>
  )
}

/**
 * What has been done to the book, as a person reads it: the lines of its
 * activity log, newest first.
 */
export function ActivityView(props: { readonly place: Place; readonly bookId: BookId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [activity] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadActivity(app.services.session, app.services.history, source.bookId),
  )
  const openerOf = (line: ActivityLine): (() => void) | undefined => {
    const play = line.parts.play
    return play === undefined ? undefined : () => moves.go({ kind: "play", bookId: props.bookId, playId: play.id })
  }

  return (
    <MainContent header={<ViewHeader place={props.place} title="操作履歴" />}>
      <div class="max-w-5xl">
        <Loaded outcome={activity()}>
          {(found) => (
            <Show when={found.lines.length > 0} fallback={<EmptyState title="操作履歴はまだありません">稼働を記録すると、ここに並びます。</EmptyState>}>
              <ul class="flex flex-col gap-0.5 p-2">
                <For each={found.lines}>
                  {(line) => <ActivityRow line={line} author={authorName(found.book, line)} onOpenPlay={openerOf(line)} />}
                </For>
              </ul>
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
