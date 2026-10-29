import { createEffect, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import { dismissHuddlePlay } from "../../../application/huddle"
import { loadTodaysPlays } from "../../../application/live-play"
import { shownNameOf } from "../../../core/catalog/catalog"
import type { HuddlePlay } from "../../../core/huddle/post"
import { playsOfChosen, roomMembersOf, roomPlaysOf, type RoomMember, type RoomPlay } from "../../../core/huddle/room"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ConfirmDialog } from "../../primitives/dialog"
import { TickFilter, type Offered } from "../../primitives/filter"
import { createHourStruck } from "../../primitives/hour"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { HUDDLE_CODE, HUDDLE_DISMISS, HUDDLE_DISMISS_ASK, HUDDLE_DISMISS_SAYS, HUDDLE_HEADING, HUDDLE_NARROW, HUDDLE_OWN, HUDDLE_TOTAL, roomMemberText } from "../../wording/huddle"
import { HuddleDialog } from "./HuddleDialog"
import { HuddleRow, type Presence } from "./HuddleRow"
import { HuddleReachNote } from "./HuddleReachNote"

/** The members of a room as its filters offer them, one's own first. */
export const offeredMembers = (members: readonly RoomMember[]): readonly Offered[] => members.map((each) => ({ key: each.member, label: roomMemberText(each.name, each.own) }))

/**
 * The room of the huddle the device is in: the way to what its members'
 * plays come to together, its QR code to show someone joining — and the
 * way out — and a filter of its members; then the plays of those chosen,
 * one's own among everyone's, by when each began (`roomPlaysOf`), each
 * under who plays it. Each opens here as everyone sees it, one's own
 * too, only to be looked at — one's own is played in the live space — and
 * one of the others' is let go of from this device's list as it was from the live
 * space's. Left, the room is gone, and so is the person from it.
 */
export function HuddleSide(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  /** The hours as they strike: the day the plays are of may turn on any of them. */
  const hour = createHourStruck()
  const [drafts] = createResource(() => [app.revision(), hour()] as const, () => loadTodaysPlays(app.services.drafts, app.services.businessDay()))
  const others = (): readonly HuddlePlay[] => app.huddle.others()
  const plays = (): readonly RoomPlay[] => ((huddle, found) => (huddle === undefined ? [] : roomPlaysOf(huddle, found?.ok === true ? found.value : [], others(), app.huddle.idle())))(app.huddle.now(), drafts())
  const members = (): readonly RoomMember[] => ((huddle) => (huddle === undefined ? [] : roomMembersOf(huddle, others())))(app.huddle.now())
  const own = (shown: RoomPlay): boolean => shown.member === app.huddle.now()?.member
  const whoPlays = (shown: RoomPlay): string => (own(shown) ? HUDDLE_OWN : (members().find((each) => each.member === shown.member)?.name ?? ""))
  const presenceOf = (member: string): Presence =>
    others().some((shown) => shown.post.member === member && shown.departed) ? "departed" : member !== app.huddle.now()?.member && app.huddle.idle().has(member) ? "idle" : "here"
  const [showingCode, setShowingCode] = createSignal(false)
  /** One of the others' plays a person asked to let go of from the list, until they say yes or no. */
  const [dismissing, setDismissing] = createSignal<RoomPlay | undefined>(undefined)
  const dismiss = (shown: RoomPlay): void => {
    setDismissing(undefined)
    const huddle = app.huddle.now()
    if (huddle === undefined) return
    dismissHuddlePlay(app.services.preferences, huddle, shown.member, shown.play.id)
    app.huddle.changed()
    if (props.place.kind === "huddle-play" && props.place.member === shown.member && props.place.playId === shown.play.id) moves.go({ kind: "huddle" })
  }
  const open = (shown: RoomPlay): void => moves.go({ kind: "huddle-play", member: shown.member, playId: shown.play.id })
  createEffect(() => {
    if (app.huddle.now() === undefined) moves.replace({ kind: "live" })
  })
  return (
    <SidePanel header={<span class="font-semibold text-text-primary">{HUDDLE_HEADING}</span>} resizeLabel="サイドパネルの幅を変える">
      <div class="flex flex-col gap-1 px-2 pt-3 empty:hidden">
        <HuddleReachNote />
      </div>
      <div class="flex items-center gap-2 px-4 pt-3">
        <Button variant="semipro" size="small" onClick={() => moves.go({ kind: "huddle-total" })}>
          {HUDDLE_TOTAL}
        </Button>
        <Button variant="outline" size="small" class="ml-auto" onClick={() => setShowingCode(true)}>
          {HUDDLE_CODE}
        </Button>
        <TickFilter label={HUDDLE_NARROW} offered={offeredMembers(members())} chosen={app.huddle.chosen.listed()} onChosen={app.huddle.chosen.setListed} none="まだ誰もいません。" />
      </div>
      <HuddleDialog open={showingCode()} onClosed={() => setShowingCode(false)} />
      <section class="px-2 pt-3">
        <Show when={playsOfChosen(plays(), app.huddle.chosen.listed()).length > 0} fallback={<p class="px-2 py-1.5 text-sm text-text-muted">表示する稼働はありません。</p>}>
          <ul class="flex flex-col gap-0.5" aria-label={HUDDLE_HEADING}>
            <For each={playsOfChosen(plays(), app.huddle.chosen.listed())}>
              {(shown) => (
                <HuddleRow
                  shown={shown}
                  who={whoPlays(shown)}
                  presence={presenceOf(shown.member)}
                  selected={props.place.kind === "huddle-play" && props.place.member === shown.member && props.place.playId === shown.play.id}
                  onSelect={() => open(shown)}
                  onDismiss={own(shown) ? undefined : () => setDismissing(shown)}
                />
              )}
            </For>
          </ul>
        </Show>
      </section>
      <ConfirmDialog
        open={dismissing() !== undefined}
        title={HUDDLE_DISMISS_ASK}
        confirm={HUDDLE_DISMISS}
        decline="やめる"
        onConfirmed={() => ((shown) => shown !== undefined && dismiss(shown))(dismissing())}
        onDeclined={() => setDismissing(undefined)}
      >
        <p>{((shown) => (shown === undefined ? "" : `${whoPlays(shown)}・${shownNameOf(app.machineNames(), shown.play.machine)}`))(dismissing())}</p>
        <p>{HUDDLE_DISMISS_SAYS}</p>
      </ConfirmDialog>
    </SidePanel>
  )
}
