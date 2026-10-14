import { useLocation } from "@solidjs/router"
import { createResource, Match, onMount, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { takeSubmission } from "../../../application/submissions"
import { useApp } from "../../context"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { ViewHeader } from "../shell/ViewHeader"
import { useStartForm } from "./start-form"
import { returnedFrom, type LeftFrom } from "./submission-return"

/**
 * Where survey.p-lens.jp sends a person back to: the submission they made
 * is kept on the device and chosen as the parlor of the play being started,
 * and the start of the game they left from is shown again — or, where they
 * left from a book's play added by hand, that form, where the submission
 * is now among the parlors to choose. A submission
 * under a name the list already has is not kept; the screen says which
 * parlor has the name and stays, since choosing for them could choose wrong.
 * Coming back with no submission — a closing or a correction was reported —
 * shows the start again as it was left.
 */
export function SubmissionReturnView(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  const location = useLocation()
  const returned = () => returnedFrom(new URLSearchParams(location.search), app.services.now())
  /** Back to where the person left from: a game's start, or a book's play added by hand. */
  const back = (from: LeftFrom): void => moves.refine(from.type === "entry" ? { kind: "tally-new", bookId: from.bookId } : { kind: "live-new", game: from.game }, "")
  const [kept] = createResource(
    () => {
      const read = returned()
      return read.ok && read.value.type === "submitted" ? read.value : undefined
    },
    async (read) => {
      const done = await takeSubmission(app.services.submissions, app.services.parlors, read.submission)
      if (done.ok && done.value.type === "kept") {
        if (read.from.type === "start") start.update({ parlor: { type: "submitted", submission: read.submission.submission } })
        app.wrote()
        back(read.from)
      }
      return done
    },
  )
  onMount(() => {
    const read = returned()
    if (read.ok && read.value.type === "nothing") back(read.value.from)
  })
  return (
    <MainContent header={<ViewHeader place={props.place} title="店舗の申請" />}>
      <div class="max-w-5xl">
        <Show
          when={returned().ok}
          fallback={<EmptyState title="申請の情報を読めませんでした">店舗の申請画面から戻ってきたときの情報が足りないか、正しくありません。</EmptyState>}
        >
          <Loaded outcome={kept()}>
            {(taken) => (
              <Switch>
                <Match when={taken.type === "kept"}>
                  <EmptyState title="申請した店舗を選びました" />
                </Match>
                <Match when={taken.type === "name-listed" && taken.parlor} keyed>
                  {(parlor) => (
                    <EmptyState title="同じ名前の店舗が一覧にあります">
                      「{parlor.name}」（{parlor.prefecture}{parlor.address}）が一覧にあります。同じ店舗なら、遊技の開始画面で一覧から選んでください。別の店舗なら、支店名を付けた名前で申請し直してください。
                    </EmptyState>
                  )}
                </Match>
              </Switch>
            )}
          </Loaded>
        </Show>
      </div>
    </MainContent>
  )
}
