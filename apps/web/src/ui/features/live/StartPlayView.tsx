import { createResource, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../application/errors"
import { linkSubmissionsInBooks } from "../../../application/parlors"
import { listSharedParlors } from "../../../application/shared-parlors"
import { listSubmissions } from "../../../application/submissions"
import { memberCan, type TitledBook } from "../../../core/book/book"
import { EMPTY_PARLOR_LIST, type ParlorList } from "../../../core/parlor/shared"
import type { PlayGameKind } from "../../../core/play/play"
import type { Submission } from "../../../parlors/port/submission-store"
import { useApp } from "../../context"
import { EmptyState, Loaded, Loading } from "../../primitives/states"
import { createWait } from "../../primitives/wait"
import type { Place } from "../../navigation/place"
import { describeError } from "../../wording/errors"
import { ViewHeader } from "../shell/ViewHeader"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"

const TITLES: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチンコ開始", slot: "スロット開始" }

/**
 * Starting a play of one game: that game's own form, and no book asked for
 * — a play is the device's until it is recorded, and which book it goes
 * into is said then. Pachinko and pachislot are kept apart on purpose,
 * however alike they look today; each will grow its own way. The parlor
 * list and this device's submissions are read here; the parlors of every
 * book this member may write that wait on a submission the list has taken
 * are linked as soon as both are known.
 */
export function StartPlayView(props: { readonly place: Place; readonly game: PlayGameKind }): JSX.Element {
  const app = useApp()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  const [parlors] = createResource(() => app.revision(), () => listSharedParlors(app.services.parlors))
  const [submissions] = createResource(() => app.revision(), () => listSubmissions(app.services.submissions))
  const writable = (all: readonly TitledBook[]): readonly TitledBook[] => all.filter((book) => memberCan(book, app.services.member, "write"))
  /** The parlor list to choose from; an empty one when it could not be read, since a play may have no parlor. */
  const list = (): ParlorList => {
    const found = parlors()
    return found?.ok === true ? found.value : EMPTY_PARLOR_LIST
  }
  const kept = (): readonly Submission[] => {
    const found = submissions()
    return found?.ok === true ? found.value : []
  }
  const parlorsFailure = (): ApplicationError | undefined => {
    const found = parlors()
    return found?.ok === false ? found.error : undefined
  }
  /** The wait for the lists a start is chosen from, shown only where it is long enough to notice. */
  const listsWait = createWait(() => parlors() === undefined || submissions() === undefined)
  const [linked] = createResource(
    () => {
      const all = books()
      const found = parlors()
      return all?.ok !== true || found?.ok !== true ? undefined : { bookIds: writable(all.value).map((book) => book.id), parlors: found.value.parlors }
    },
    async (source) => {
      const done = await linkSubmissionsInBooks(app.services.session, source.bookIds, source.parlors)
      if (done.ok && done.value > 0) app.wrote()
      return done
    },
  )
  const linkFailure = (): ApplicationError | undefined => {
    const found = linked()
    return found?.ok === false ? found.error : undefined
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title={TITLES[props.game]} />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-5 p-4">
          <Loaded outcome={books()}>
            {(all) => (
              <Show when={writable(all).length > 0} fallback={<EmptyState title="記録できる帳簿がありません">編集できる帳簿があると、稼働を始められます。</EmptyState>}>
                <Show when={parlorsFailure()} keyed>
                  {(error) => <p class="text-xs text-text-muted">店舗の一覧を読めませんでした。店舗名なしでなら始められます。（{describeError(error)}）</p>}
                </Show>
                <Show when={linkFailure()} keyed>
                  {(error) => <p class="text-xs text-text-muted">申請した店舗を帳簿に紐付けられませんでした。（{describeError(error)}）</p>}
                </Show>
                <Switch>
                  <Match when={listsWait().type === "shown"}>
                    <Loading />
                  </Match>
                  <Match when={listsWait().type === "over" && props.game === "pachinko"}>
                    <PachinkoViews.Start list={list()} submissions={kept()} />
                  </Match>
                  <Match when={listsWait().type === "over" && props.game === "slot"}>
                    <PachislotViews.Start list={list()} submissions={kept()} />
                  </Match>
                </Switch>
              </Show>
            )}
          </Loaded>
        </div>
      </div>
    </MainContent>
  )
}
