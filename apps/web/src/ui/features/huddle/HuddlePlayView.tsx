import { MainContent } from "solid-gathering-shell"
import { createResource, Show, type JSX } from "solid-js"

import { loadDraft } from "../../../application/live-play"
import { shownNameOf } from "../../../core/catalog/catalog"
import { parlorOf } from "../../../core/live-play/draft"
import type { Play } from "../../../core/live-play/draft-reading"
import type { PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import { EmptyState } from "../../primitives/states"
import type { Place } from "../../navigation/place"
import { formatMoment } from "../../wording/dates"
import { HUDDLE_OWN, huddleShownAt } from "../../wording/huddle"
import { parlorText } from "../../wording/parlor"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"
import { ViewHeader } from "../shell/ViewHeader"

/** A play as the room opens it: whose, under the name they go by, and when it was last shown to the huddle — none for one's own, as it stands on this device. */
interface Seen {
  readonly play: Play
  readonly name: string
  readonly shownAt: string | undefined
}

/**
 * A play in a huddle, opened from its room as everyone sees it: who plays
 * it and on what, when it was last shown, and the play as its game draws
 * it, only to be looked at. One's own is drawn the same, as this device
 * has it now — what the others see, or a moment ahead of it — and is
 * played in the live space. Nothing where the huddle has not shown it, or
 * the device is in none.
 */
export function HuddlePlayView(props: { readonly place: Place; readonly member: string; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const own = (): boolean => app.huddle.now()?.member === props.member
  const [draft] = createResource(
    () => (own() ? ([props.playId, app.revision()] as const) : undefined),
    ([playId]) => loadDraft(app.services.drafts, playId),
  )
  const found = (): Seen | undefined => {
    const huddle = app.huddle.now()
    if (huddle === undefined) return undefined
    if (own()) return ((read) => (read?.ok === true ? { play: read.value, name: HUDDLE_OWN, shownAt: undefined } : undefined))(draft.latest)
    return ((shown) => (shown === undefined ? undefined : { play: shown.post.play, name: shown.post.name, shownAt: shown.post.postedAt }))(app.huddle.counted().find(({ post }) => post.member === props.member && post.play.id === props.playId))
  }
  const title = (): string => ((seen) => (seen === undefined ? "" : `${seen.name}・${shownNameOf(app.machineNames(), seen.play.machine)}${seen.play.cabinetNumber === undefined ? "" : ` ${seen.play.cabinetNumber}番台`}`))(found())
  return (
    <MainContent header={<ViewHeader place={props.place} title={title()} />}>
      <Show when={found()} keyed fallback={<EmptyState title="この稼働は見つかりません" />}>
        {(seen) => (
          <div class="flex max-w-5xl flex-col gap-3 p-3">
            <p class="text-xs text-text-muted">
              {parlorText(parlorOf(seen.play))}
              {seen.shownAt === undefined ? "" : `・${huddleShownAt(formatMoment(seen.shownAt))}`}
            </p>
            {seen.play.gameKind === "pachinko" ? <PachinkoViews.HuddlePlay play={seen.play} /> : <PachislotViews.HuddlePlay play={seen.play} />}
          </div>
        )}
      </Show>
    </MainContent>
  )
}
