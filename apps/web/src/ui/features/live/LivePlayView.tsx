import { createResource, Show, type JSX } from "solid-js"

import { loadDraft } from "../../../application/live-play"
import { shownNameOf, type MachineNames } from "../../../core/catalog/catalog"
import { parlorOf, type PachislotDraft, type PlayDraft } from "../../../core/live-play/draft"
import type { PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import { Loaded } from "../../primitives/states"
import type { Place } from "../../navigation/place"
import { parlorText } from "../../wording/parlor"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"

const titleOf = (draft: PlayDraft, machineNames: MachineNames): string =>
  `${shownNameOf(machineNames, draft.machine)}${draft.cabinetNumber === undefined ? "" : ` ${draft.cabinetNumber}番台`}（${parlorText(parlorOf(draft))}）`

/**
 * A play in progress, followed at the cabinet: what it comes to so far, its
 * readings in order, and the place to add the next one.
 */
export function LivePlayView(props: { readonly place: Place; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const [draft] = createResource(
    () => ({ playId: props.playId, revision: app.revision() }),
    (source) => loadDraft(app.services.drafts, source.playId),
  )
  /** A pachislot play, kept on screen across reloads of its draft: its counting tiles are tapped faster than a screen could be rebuilt. */
  const slotDraft = (): PachislotDraft | undefined => {
    const found = draft()
    return found?.ok === true && found.value.gameKind === "slot" ? found.value : undefined
  }
  return (
    <Show
      when={slotDraft()}
      fallback={
        <Loaded outcome={draft()}>
          {(found) => (found.gameKind === "pachinko" ? <PachinkoViews.LivePlay place={props.place} draft={found} title={titleOf(found, app.machineNames())} /> : undefined)}
        </Loaded>
      }
    >
      {(slot) => <PachislotViews.LivePlay place={props.place} draft={slot()} title={titleOf(slot(), app.machineNames())} />}
    </Show>
  )
}
