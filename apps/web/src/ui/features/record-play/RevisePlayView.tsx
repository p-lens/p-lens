import { createResource, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadRecordedPlay, revisePlay, reviseTalliedPlay } from "../../../application/revise-play"
import type { BookId } from "../../../core/book/book"
import type { PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import { EmptyState, Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { ViewHeader } from "../shell/ViewHeader"
import { formOfRecord, playedAsRecorded, REVISING } from "./form"
import { RecordForm } from "./RecordForm"
import { tallyFormOfPlay } from "./tally-form"
import { createOffered, TallyEditor } from "./TallyPlayView"

/**
 * Setting a recorded play right, in the form it was recorded with: in
 * tokens at its parlor, counted as its entry counts them, or by its result
 * in yen. Where it was played and at what rate are not the form's to
 * change; a play recorded at the wrong parlor is removed and recorded
 * again. Saved, its entry is written anew where it stands.
 */
export function RevisePlayView(props: { readonly place: Place; readonly bookId: BookId; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const offered = createOffered()
  const [revising] = createResource(
    () => ({ bookId: props.bookId, playId: props.playId }),
    (source) => loadRecordedPlay(app.services.session, source.bookId, app.services.member, source.playId),
  )
  const revised = (): void => {
    app.wrote()
    toast({ title: "稼働を修正しました" })
    moves.go({ kind: "play", bookId: props.bookId, playId: props.playId })
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="稼働を修正" />}>
      <div class="max-w-5xl">
        <Loaded outcome={revising()}>
          {(found) => (
            <Show when={found.context.canWrite} fallback={<EmptyState title="この帳簿は閲覧のみです">修正するには、帳簿の所有者から編集者の権限を受け取ってください。</EmptyState>}>
              <Switch>
                <Match when={found.recorded.type === "at-parlor" && found.recorded} keyed>
                  {(recorded) => (
                    <RecordForm
                      context={found.context}
                      at={playedAsRecorded(recorded.record, found.context.prices)}
                      initial={formOfRecord(recorded.record)}
                      playId={props.playId}
                      words={REVISING}
                      submit={(record) => revisePlay(app.services.session, props.bookId, record)}
                      onRecorded={revised}
                    />
                  )}
                </Match>
                <Match when={found.recorded.type === "tallied" && found.recorded} keyed>
                  {(recorded) => (
                    <TallyEditor
                      context={found.context}
                      list={offered.list()}
                      submissions={offered.submissions()}
                      bookId={props.bookId}
                      initial={tallyFormOfPlay(recorded.play)}
                      playIdOn={() => props.playId}
                      words={REVISING}
                      submit={(play) => reviseTalliedPlay(app.services.session, props.bookId, play)}
                      onRecorded={revised}
                    />
                  )}
                </Match>
              </Switch>
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
