import { createResource, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { loadDraft } from "../../../application/live-play"
import { shownNameOf, type MachineNames } from "../../../core/catalog/catalog"
import { parlorOf, type PachinkoDraft, type PachislotDraft, type PlayDraft } from "../../../core/live-play/draft"
import type { PlayId } from "../../../core/play/play"
import type { Outcome } from "../../../application/errors"
import { useApp } from "../../context"
import { Loaded } from "../../primitives/states"
import type { Place } from "../../navigation/place"
import { parlorText } from "../../wording/parlor"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"
import { cabinetText } from "../../wording/cabinet"
import { seal } from "../../../mummer"
import { PlayUnread } from "./PlayUnread"
import { createElsewhereHold, HELD, type PlayHold } from "./play-hold"

const titleOf = (draft: PlayDraft, machineNames: MachineNames): string =>
  `${shownNameOf(machineNames, draft.machine)}${draft.cabinetNumber === undefined ? "" : ` ${cabinetText(seal.cabinet(draft.cabinetNumber))}`}（${parlorText(parlorOf(draft))}）`

/** A play as it is drawn: this device's own, or its copy of one another of the owner's devices holds, and how the screen has it. */
interface Opened<D extends PlayDraft> {
  readonly draft: D
  readonly hold: PlayHold
}

/**
 * A play in progress, followed at the cabinet: what it comes to so far, its
 * readings in order, and the place to add the next one. A play another of
 * the owner's devices holds, which this device does not keep, is drawn the
 * same, as its copy here was last made, with nothing that writes and the
 * way to continue it here where the next reading would be typed; and so is
 * a play someone sent to one of the owner's books, with the way to record
 * it there.
 */
export function LivePlayView(props: { readonly place: Place; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const [loaded] = createResource(
    () => ({ playId: props.playId, revision: app.revision() }),
    (source) => loadDraft(app.services.drafts, source.playId),
  )
  const elsewhere = createElsewhereHold(() => props.playId)
  /** What is drawn: the device's own play, or, where it keeps none, the copy of one another device holds or the play someone sent. */
  const opened = (): Opened<PlayDraft> | undefined => {
    const found = loaded()
    if (found?.ok === true) return { draft: found.value, hold: HELD }
    return elsewhere()
  }
  /** A pachislot play, kept on screen across reloads of its draft: its counting tiles are tapped faster than a screen could be rebuilt. */
  const pachislotOpened = (): Opened<PachislotDraft> | undefined => ((found) => (found?.draft.gameKind === "pachislot" ? { draft: found.draft, hold: found.hold } : undefined))(opened())
  /** A pachinko play held elsewhere, kept on screen as its copy comes again and again: rebuilt each time, it would lose where it was scrolled to, and close what was open. */
  const pachinkoElsewhere = (): Opened<PachinkoDraft> | undefined => ((found) => (found?.draft.gameKind === "pachinko" && found.hold.type !== "held" ? { draft: found.draft, hold: found.hold } : undefined))(opened())
  const unread = (): ApplicationError | undefined => ((found) => (found?.ok === false && elsewhere() === undefined ? found.error : undefined))(loaded())
  /** The device's own pachinko play, read again after each write as it was before plays crossed devices. */
  const ownPachinko = (): Outcome<PlayDraft> | undefined => ((found) => (found?.ok === false ? undefined : found))(loaded())
  /** The play drawn, once it is read. */
  const playing = (): JSX.Element => (
    <Show
      when={pachislotOpened()}
      fallback={
        <Show
          when={pachinkoElsewhere()}
          fallback={
            <Loaded outcome={ownPachinko()}>
              {(draft) => (draft.gameKind === "pachinko" ? <PachinkoViews.LivePlay place={props.place} draft={draft} hold={HELD} title={titleOf(draft, app.machineNames())} /> : undefined)}
            </Loaded>
          }
        >
          {(pachinko) => <PachinkoViews.LivePlay place={props.place} draft={pachinko().draft} hold={pachinko().hold} title={titleOf(pachinko().draft, app.machineNames())} />}
        </Show>
      }
    >
      {(pachislot) => <PachislotViews.LivePlay place={props.place} draft={pachislot().draft} hold={pachislot().hold} title={titleOf(pachislot().draft, app.machineNames())} />}
    </Show>
  )
  return (
    <Show when={unread()} keyed fallback={playing()}>
      {(error) => <PlayUnread playId={props.playId} error={error} />}
    </Show>
  )
}
