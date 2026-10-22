import { MainContent } from "solid-gathering-shell"
import { Show, type JSX } from "solid-js"

import { shownNameOf } from "../../../core/catalog/catalog"
import type { HuddlePlay } from "../../../core/huddle/post"
import { parlorOf } from "../../../core/live-play/draft"
import type { PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import { EmptyState } from "../../primitives/states"
import type { Place } from "../../navigation/place"
import { formatMoment } from "../../wording/dates"
import { huddleShownAt } from "../../wording/huddle"
import { parlorText } from "../../wording/parlor"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"
import { ViewHeader } from "../shell/ViewHeader"

/**
 * One of the others' plays in a huddle, opened from its room: who
 * plays it and on what, when it was last shown, and the play as its game
 * draws it, only to be looked at. Nothing where the huddle has not shown
 * it, or the device is in none.
 */
export function HuddlePlayView(props: { readonly place: Place; readonly member: string; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const found = (): HuddlePlay | undefined => {
    const huddle = app.huddle.now()
    return huddle === undefined ? undefined : app.huddle.others().find(({ post }) => post.member === props.member && post.play.id === props.playId)
  }
  const title = (): string => {
    const shown = found()?.post
    return shown === undefined ? "" : `${shown.name}・${shownNameOf(app.machineNames(), shown.play.machine)}${shown.play.cabinetNumber === undefined ? "" : ` ${shown.play.cabinetNumber}番台`}`
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title={title()} />}>
      <Show when={found()} keyed fallback={<EmptyState title="この稼働は見つかりません" />}>
        {({ post }) => (
          <div class="flex max-w-5xl flex-col gap-3 p-3">
            <p class="text-xs text-text-muted">
              {parlorText(parlorOf(post.play))}・{huddleShownAt(formatMoment(post.postedAt))}
            </p>
            {post.play.gameKind === "pachinko" ? <PachinkoViews.HuddlePlay play={post.play} /> : <PachislotViews.HuddlePlay play={post.play} />}
          </div>
        )}
      </Show>
    </MainContent>
  )
}
