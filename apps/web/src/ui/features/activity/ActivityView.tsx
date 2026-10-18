import { createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadActivity } from "../../../application/activity"
import type { Book, BookId } from "../../../core/book/book"
import { ACTIVITY_LOG, type ActivityLine } from "../../../core/activity/activity"
import { useApp } from "../../context"
import { Revealed } from "../../primitives/revealed"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { describeActivity } from "../../wording/activity"
import { formatMoment } from "../../wording/dates"
import { unreadableFileText } from "../../wording/errors"
import { formatTheoreticalYen } from "../../wording/numbers"
import { ViewHeader } from "../shell/ViewHeader"

const authorName = (book: Book | undefined, line: ActivityLine): string => book?.members.find((member) => member.id === line.by)?.displayName ?? line.by

function ActivityRow(props: { readonly line: ActivityLine; readonly author: string; readonly onOpenTally: (() => void) | undefined }): JSX.Element {
  return (
    <li class="flex gap-3 rounded px-3 py-2 hover:bg-surface-3/40">
      <time class="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-text-muted" datetime={props.line.at}>
        {formatMoment(props.line.at)}
      </time>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-semibold text-text-primary">{props.author}</span>
        <span class="text-sm text-text-secondary">{describeActivity(props.line)}</span>
        <Show when={props.line.parts.theoretical} keyed>
          {(theoretical) => <span class="text-xs text-text-muted">期待値 {formatTheoreticalYen(theoretical.value)}</span>}
        </Show>
      </div>
      <Show when={props.onOpenTally} keyed>
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
    const tally = line.parts.play
    return tally === undefined ? undefined : () => moves.go({ kind: "tally", bookId: props.bookId, playId: tally.id })
  }

  return (
    <MainContent header={<ViewHeader place={props.place} title="操作履歴" />}>
      <div class="max-w-5xl">
        <Loaded outcome={activity()}>
          {(found) => (
            <>
              <Show when={found.unreadable.length > 0}>
                <p role="alert" class="mx-4 mt-3 rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
                  {unreadableFileText(ACTIVITY_LOG, found.unreadable)}その行は下の一覧に入っていません。
                </p>
              </Show>
              <Show when={found.lines.length > 0} fallback={<EmptyState title="操作履歴はまだありません">収支を記録すると、ここに並びます。</EmptyState>}>
                <ul class="flex flex-col gap-0.5 p-2">
                  <Revealed count={found.lines.length}>
                    {(shown) => <For each={found.lines.slice(0, shown())}>{(line) => <ActivityRow line={line} author={authorName(found.book, line)} onOpenTally={openerOf(line)} />}</For>}
                  </Revealed>
                </ul>
              </Show>
            </>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
