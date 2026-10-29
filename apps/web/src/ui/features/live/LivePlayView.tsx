import { createEffect, createResource, onCleanup, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { mapOk } from "../../../core/result/result"
import { loadLivePlay, type LivePlayHold } from "../../../application/play-line"
import { shownNameOf, type MachineNames } from "../../../core/catalog/catalog"
import { parlorOf, type PachinkoDraft, type PachislotDraft, type PlayDraft } from "../../../core/live-play/draft"
import type { PlayId } from "../../../core/play/play"
import { useApp, type Continuing } from "../../context"
import { useMoves } from "../../navigation/moves"
import { Loaded } from "../../primitives/states"
import type { Place } from "../../navigation/place"
import { parlorText } from "../../wording/parlor"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"
import { cabinetText } from "../../wording/cabinet"
import { seal } from "../../../mummer"
import type { PlayHold } from "./play-hold"
import { PlayUnread } from "./PlayUnread"

const titleOf = (draft: PlayDraft, machineNames: MachineNames): string =>
  `${shownNameOf(machineNames, draft.machine)}${draft.cabinetNumber === undefined ? "" : ` ${cabinetText(seal.cabinet(draft.cabinetNumber))}`}（${parlorText(parlorOf(draft))}）`

/** A play as it is drawn: the draft, this device's own or its copy of another's, and how the screen has it. */
interface Opened {
  readonly draft: PlayDraft
  readonly hold: PlayHold
}

const HELD: PlayHold = { type: "held" }

const openedOf = (found: LivePlayHold, onContinue: (playId: PlayId) => Promise<void>): Opened =>
  found.type === "held" ? { draft: found.draft, hold: HELD } : { draft: found.followed.play, hold: { type: "followed", shownAt: found.followed.shownAt, onContinue: () => onContinue(found.followed.id) } }

/**
 * A play in progress, followed at the cabinet: what it comes to so far, its
 * readings in order, and the place to add the next one. A play another of
 * the owner's devices holds is drawn the same, as its copy here was last
 * shown, with nothing that writes and the way to continue it here where
 * the next reading would be typed; while it is open, its line is read
 * more often.
 */
export function LivePlayView(props: { readonly place: Place; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const leftIfGone = (continuing: Continuing): void => {
    if (continuing === "gone") moves.replace({ kind: "live" })
  }
  const continued = async (playId: PlayId): Promise<void> => leftIfGone(await app.playLine.continueHere(playId))
  const [loaded] = createResource(
    () => ({ playId: props.playId, revision: app.revision() }),
    async (source) => mapOk(await loadLivePlay(app.services.drafts, app.services.playLine.follow, source.playId), (found) => openedOf(found, continued)),
  )
  createEffect(() => {
    const found = loaded()
    if (found?.ok === true) app.playLine.watch(found.value.hold.type === "followed" ? found.value.draft.id : undefined)
  })
  onCleanup(() => app.playLine.watch(undefined))
  /** A pachislot play, kept on screen across reloads of its draft: its counting tiles are tapped faster than a screen could be rebuilt. */
  const pachislotOpened = (): { readonly draft: PachislotDraft; readonly hold: PlayHold } | undefined => {
    const found = loaded()
    return found?.ok === true && found.value.draft.gameKind === "pachislot" ? { draft: found.value.draft, hold: found.value.hold } : undefined
  }
  /** A pachinko play another device holds, kept on screen as its copy is shown again and again: rebuilt each time, it would lose where it was scrolled to, and close what was open. */
  const pachinkoFollowed = (): { readonly draft: PachinkoDraft; readonly hold: PlayHold } | undefined => {
    const found = loaded()
    return found?.ok === true && found.value.draft.gameKind === "pachinko" && found.value.hold.type === "followed" ? { draft: found.value.draft, hold: found.value.hold } : undefined
  }
  const unread = (): ApplicationError | undefined => ((found) => (found?.ok === false ? found.error : undefined))(loaded())
  /** The play drawn, once it is read. */
  const playing = (): JSX.Element => (
    <Show
      when={pachislotOpened()}
      fallback={
        <Show
          when={pachinkoFollowed()}
          fallback={
            <Loaded outcome={loaded()}>
              {(found) => (found.draft.gameKind === "pachinko" ? <PachinkoViews.LivePlay place={props.place} draft={found.draft} hold={found.hold} title={titleOf(found.draft, app.machineNames())} /> : undefined)}
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
