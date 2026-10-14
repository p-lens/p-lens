import { createResource, createSignal, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadRecordedTally, reviseTokenTally, reviseYenTally } from "../../../application/revise-tally"
import type { BookId } from "../../../core/book/book"
import { asideOfTally } from "../../../core/tally/aside"
import type { PlayId } from "../../../core/play/play"
import type { TallyAside, TallyHead } from "../../../core/tally/tally"
import { useApp } from "../../context"
import { EmptyState, Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { ViewHeader } from "../shell/ViewHeader"
import { ClockFields } from "./ClockFields"
import { tokenTallyFormOf, playedAsRecorded, REVISING } from "./form"
import { TokenTallyEditor } from "./TokenTallyEditor"
import { yenTallyFormOf } from "./yen-tally-form"
import { createOffered } from "./yen-tally-editing"
import { YenTallyEditor } from "./AddTallyView"

/**
 * Setting a recorded tally right, in the form it was recorded with: in
 * tokens at its parlor, counted as its entry counts them, or by its totals
 * in yen. Where it was played and at what rate are not the form's to
 * change; a tally recorded at the wrong parlor is removed and recorded
 * again. When its play began and finished is asked above the form, as its
 * entry says it, and may be said of a tally that said neither. Saved, its
 * entry is written anew where it stands.
 */
export function ReviseTallyView(props: { readonly place: Place; readonly bookId: BookId; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const offered = createOffered()
  const [revising] = createResource(
    () => ({ bookId: props.bookId, playId: props.playId }),
    (source) => loadRecordedTally(app.services.session, source.bookId, app.services.member, source.playId),
  )
  const revised = (): void => {
    app.wrote()
    toast({ title: "収支を修正しました" })
    moves.go({ kind: "tally", bookId: props.bookId, playId: props.playId })
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="収支の修正" />}>
      <div class="max-w-5xl">
        <Loaded outcome={revising()}>
          {(found) => {
            const tally: TallyHead = found.recorded.tally
            const [clock, setClock] = createSignal(tally.clock)
            const aside = (): TallyAside => ({ ...asideOfTally(tally), clock: clock() })
            return (
              <Show when={found.context.canWrite} fallback={<EmptyState title="この帳簿は閲覧のみです">修正するには、帳簿の所有者から編集者の権限を受け取ってください。</EmptyState>}>
                <ClockFields clock={clock()} onChange={setClock} />
                <Switch>
                  <Match when={found.recorded.type === "token" && found.recorded} keyed>
                    {(recorded) => (
                      <TokenTallyEditor
                        context={found.context}
                        at={playedAsRecorded(recorded.tally, found.context.prices)}
                        initial={tokenTallyFormOf(recorded.tally)}
                        playId={props.playId}
                        aside={aside}
                        words={REVISING}
                        submit={(tally) => reviseTokenTally(app.services.session, props.bookId, tally)}
                        onRecorded={revised}
                      />
                    )}
                  </Match>
                  <Match when={found.recorded.type === "yen" && found.recorded} keyed>
                    {(recorded) => (
                      <YenTallyEditor
                        context={found.context}
                        list={offered.list()}
                        submissions={offered.submissions()}
                        bookId={props.bookId}
                        initial={yenTallyFormOf(recorded.tally)}
                        playIdOn={() => props.playId}
                        aside={aside()}
                        words={REVISING}
                        submit={(tally) => reviseYenTally(app.services.session, props.bookId, tally)}
                        onRecorded={revised}
                      />
                    )}
                  </Match>
                </Switch>
              </Show>
            )
          }}
        </Loaded>
      </div>
    </MainContent>
  )
}
