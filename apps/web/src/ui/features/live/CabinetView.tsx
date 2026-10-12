import { createResource, type JSX } from "solid-js"

import { loadDraft } from "../../../application/live-play"
import type { PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import type { Place } from "../../navigation/place"
import { Loaded } from "../../primitives/states"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"

/**
 * Where a play in progress is said anew to be at another cabinet or on
 * another machine: its game's own screen, once the play is read. The play
 * is read as the screen opens and not again while it is typed into, so
 * nothing written elsewhere takes what is being typed away.
 */
export function CabinetView(props: { readonly place: Place; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const [draft] = createResource(
    () => props.playId,
    (playId) => loadDraft(app.services.drafts, playId),
  )
  return <Loaded outcome={draft()}>{(found) => (found.gameKind === "slot" ? <PachislotViews.Cabinet place={props.place} draft={found} /> : <PachinkoViews.Cabinet place={props.place} draft={found} />)}</Loaded>
}
