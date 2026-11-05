import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import { abandonPlay, loadTodaysPlays } from "../../../application/live-play"
import { shownNameOf, type MachineNames } from "../../../core/catalog/catalog"
import { isLeftOver, parlorOf, type PlayDraft } from "../../../core/live-play/draft"
import { useApp } from "../../context"
import { Button, SWITCHED_ON } from "../../primitives/button"
import { cn } from "../../primitives/cn"
import { ConfirmDialog, PanelDialog } from "../../primitives/dialog"
import { createHourStruck } from "../../primitives/hour"
import { CloseIcon, SendIcon } from "../../primitives/icons"
import { createLongPress } from "../../primitives/long-press"
import { Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { businessDayNote } from "../../wording/dates"
import { describeError } from "../../wording/errors"
import { parlorText } from "../../wording/parlor"
import { HUDDLE_GIVEN_UP, HUDDLE_JOINED, HUDDLE_OPEN } from "../../wording/huddle"
import { HuddleDialog } from "../huddle/HuddleDialog"
import { captionOf } from "./play-caption"
import { cabinetText } from "../../wording/cabinet"
import { seal } from "../../../mummer"
import { RECORDED_MARK } from "../../wording/tallies"
import { FOLLOWED_MARK } from "../../wording/play-line"
import { arrivedMark, CHOOSE_DESTINATION, CHOOSE_DESTINATION_DECLINE, NOT_SENT, SEND_PLAY, SENDING_MARK, sendingProblemText, sentToText, STOP_SENDING, STOPPED_SENDING, stopSendingWording } from "../../wording/sending"
import { titleText } from "../../wording/book"
import type { Destination, PlaySender } from "../../../crossing"

const openPlay = (place: Place): string | undefined =>
  place.kind === "live-play" || place.kind === "live-record" || place.kind === "live-cabinet" ? place.playId : undefined

/** One of the day's plays as the list has it: the device's own, a copy of one another of the owner's devices holds, or one someone sent to one of the owner's books. */
type Listed =
  | { readonly kind: "own"; readonly draft: PlayDraft }
  | { readonly kind: "followed"; readonly draft: PlayDraft }
  | { readonly kind: "arrived"; readonly draft: PlayDraft; readonly sender: PlaySender }

/** What stands beside a play's place and time, each a word: that another device holds it, or whose it is, that it is being sent, and that its book has it already. */
const marksOf = (listed: Listed, sending: boolean): readonly string[] => [
  ...(listed.kind === "followed" ? [FOLLOWED_MARK] : []),
  ...(listed.kind === "arrived" ? [arrivedMark(listed.sender.name)] : []),
  ...(sending ? [SENDING_MARK] : []),
  ...(listed.draft.recorded === undefined ? [] : [RECORDED_MARK]),
]

/** The device's own plays, those another device holds that it does not keep, and those sent to the owner's books, newest begun first. */
const listedOf = (own: readonly PlayDraft[], followed: readonly PlayDraft[], arrived: readonly { readonly play: PlayDraft; readonly sender: PlaySender }[]): readonly Listed[] =>
  [
    ...own.map((draft): Listed => ({ kind: "own", draft })),
    ...followed.filter((draft) => !own.some((each) => each.id === draft.id)).map((draft): Listed => ({ kind: "followed", draft })),
    ...arrived.filter(({ play }) => !own.some((each) => each.id === play.id)).map(({ play, sender }): Listed => ({ kind: "arrived", draft: play, sender })),
  ].toSorted((left, right) => right.draft.startedAt.localeCompare(left.draft.startedAt))

/**
 * One of the day's plays: pressed, it opens; held — by a finger or a mouse
 * — it asks to be given up, and where a pointer can hover, a small cross
 * shows there for the same. A red dot stands before one left over from a
 * day before, still to be recorded. Where the device sends plays to a book,
 * a paper plane at the row's end sends the play, painted while it is sent.
 * A play another device holds, or someone sent, is given up there, and has
 * none of these.
 */
function DraftRow(props: {
  readonly listed: Listed
  readonly leftOver: boolean
  readonly selected: boolean
  /** Whether the play is being sent; none where the device sends plays nowhere, or the play is not its own. */
  readonly sending: boolean | undefined
  readonly onSelect: () => void
  readonly onAbandon: () => void
  readonly onSend: () => void
}): JSX.Element {
  const app = useApp()
  const own = (): boolean => props.listed.kind === "own"
  const abandon = (): void => {
    if (own()) props.onAbandon()
  }
  const hold = createLongPress(abandon)
  return (
    <li class="group relative">
      <button
        type="button"
        aria-current={props.selected ? "page" : undefined}
        onClick={() => {
          if (!hold.wasLong()) props.onSelect()
        }}
        onPointerDown={hold.onPointerDown}
        onPointerMove={hold.onPointerMove}
        onPointerUp={hold.onPointerUp}
        onPointerLeave={hold.onPointerLeave}
        onPointerCancel={hold.onPointerCancel}
        onContextMenu={hold.onContextMenu}
        class="flex w-full select-none flex-col rounded px-2 py-1.5 text-left transition-colors [-webkit-touch-callout:none]"
        classList={{ "bg-surface-3 text-text-primary": props.selected, "text-text-muted hover:bg-surface-3/60 hover:text-text-secondary": !props.selected, "pr-9": props.sending !== undefined }}
      >
        <span class="flex items-center gap-1.5 truncate text-[15px]">
          <Show when={props.leftOver}>
            <span class="size-2 shrink-0 rounded-full bg-negative" role="img" aria-label="前の日の、まだ記帳していない稼働" />
          </Show>
          <span class="truncate">{shownNameOf(app.machineNames(), props.listed.draft.machine)}</span>
        </span>
        <span class="truncate text-xs text-text-muted">{captionOf(props.listed.draft, app.services.businessDay())}</span>
        <Show when={marksOf(props.listed, props.sending === true).length > 0}>
          <span class="truncate text-xs text-text-secondary">{marksOf(props.listed, props.sending === true).join("・")}</span>
        </Show>
      </button>
      <Show when={props.sending !== undefined}>
        <button
          type="button"
          onClick={() => props.onSend()}
          class="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded hover:bg-surface-0 [&_svg]:size-4"
          classList={{ "text-accent [&_path]:fill-accent/25": props.sending === true, "text-text-secondary hover:text-text-primary": props.sending !== true }}
        >
          <SendIcon label={props.sending === true ? STOP_SENDING : SEND_PLAY} />
        </button>
      </Show>
      <Show when={own()}>
        <button
          type="button"
          aria-label="この稼働を削除"
          title="この稼働を削除"
          onClick={abandon}
          class="absolute right-0.5 top-0.5 hidden size-5 items-center justify-center rounded text-text-muted hover:bg-surface-0 hover:text-text-primary focus-visible:flex group-hover:flex [&_svg]:size-3.5"
        >
          <CloseIcon label="" />
        </button>
      </Show>
    </li>
  )
}

/** A play as a sentence names it: its machine, as the halls call it, and cabinet, or its parlor where it has no machine. */
const draftName = (draft: PlayDraft, machineNames: MachineNames): string => {
  const machine = `${shownNameOf(machineNames, draft.machine)}${draft.cabinetNumber === undefined ? "" : ` ${cabinetText(seal.cabinet(draft.cabinetNumber))}`}`.trim()
  return machine === "" ? parlorText(parlorOf(draft)) : machine
}

/**
 * The day's plays on this device, newest begun first, and the way to start
 * another of either game: every play still to be recorded, and those
 * recorded since the business day turned, which stay to be set right and
 * recorded again; and among them those another of the owner's devices
 * holds, marked so, and those people send to the owner's books, marked with
 * whose they are. A play left over from a day before is marked red, and
 * the list ends by saying what the mark is and what to do about it — a
 * mark alone tells a person seeing it for the first time nothing. ノリ打ち
 * is begun or joined from its heading, where the build names a relay; once
 * in one, the same button leads to its room, where the others' plays are.
 */
export function LiveSide(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  /** The hours as they strike: the day the list is of may turn on any of them. */
  const hour = createHourStruck()
  const [drafts] = createResource(() => [app.revision(), hour()] as const, () => loadTodaysPlays(app.services.drafts, app.services.businessDay()))
  /** The business day said after the list's 「本日」 once the device's clock is past midnight, read again as each hour strikes. */
  const dayNote = (): string | undefined => {
    hour()
    return businessDayNote(app.services.businessDay(), app.services.today())
  }
  /** The plays another of the owner's devices holds, as this device last had them. */
  const followed = (): readonly PlayDraft[] => app.bookLines.followed().map((play) => play.play)
  /** The books this device may send plays to now. */
  const destinations = (): readonly Destination[] => app.bookLines.destinations().filter((destination) => !destination.removed)
  /** Where a play of the device's is being sent; none where it is not. */
  const sentTo = (draft: PlayDraft): Destination | undefined =>
    ((sent) => (sent === undefined ? undefined : destinations().find((destination) => destination.invitation === sent.invitation)))(app.bookLines.sent().find((play) => play.playId === draft.id && !play.ended))
  /** Whether a row's play is being sent: none where it cannot be, being another's or there being nowhere to send it. */
  const sendingOf = (listed: Listed): boolean | undefined => (listed.kind !== "own" || destinations().length === 0 ? undefined : sentTo(listed.draft) !== undefined)
  /** The play whose destination is being chosen, and the one a person asked to send no longer, until they say. */
  const [choosing, setChoosing] = createSignal<PlayDraft | undefined>(undefined)
  const [stopping, setStopping] = createSignal<{ readonly draft: PlayDraft; readonly destination: Destination } | undefined>(undefined)
  const sendTo = async (draft: PlayDraft, destination: Destination): Promise<void> => {
    setChoosing(undefined)
    const sent = await app.bookLines.send(draft.id, destination.invitation)
    toast(sent.ok ? { title: sentToText(destination.title) } : { title: NOT_SENT, description: sendingProblemText(sent.error), tone: "error" })
  }
  const stopSending = async (draft: PlayDraft): Promise<void> => {
    setStopping(undefined)
    const stopped = await app.bookLines.stopSending(draft.id)
    toast(stopped.ok ? { title: STOPPED_SENDING } : { title: NOT_SENT, description: sendingProblemText(stopped.error), tone: "error" })
  }
  /** The paper plane pressed: sent no longer where it is being sent, else sent where there is one book to send to, else that book chosen. */
  const pressSend = (draft: PlayDraft): void => {
    const to = sentTo(draft)
    const [only, ...more] = destinations()
    if (to !== undefined) setStopping({ draft, destination: to })
    else if (only !== undefined && more.length === 0) void sendTo(draft, only)
    else setChoosing(draft)
  }
  /** The play a person asked to give up, until they say yes or no. */
  const [abandoning, setAbandoning] = createSignal<PlayDraft | undefined>(undefined)
  /** Whether ノリ打ち is open. */
  const [huddling, setHuddling] = createSignal(false)
  const abandon = async (draft: PlayDraft): Promise<void> => {
    setAbandoning(undefined)
    const gone = await abandonPlay(app.services.drafts, draft.id)
    if (!gone.ok) {
      toast({ title: "稼働を削除できませんでした", description: describeError(gone.error), tone: "error" })
      return
    }
    app.played()
    if (openPlay(props.place) === draft.id) moves.go({ kind: "live" })
  }
  return (
    <SidePanel header={<span class="font-semibold text-text-primary">ライブ計測</span>} resizeLabel="サイドパネルの幅を変える">
      <div class="grid grid-cols-2 gap-2 px-2 pt-3">
        <Button onClick={() => moves.go({ kind: "live-new", game: "pachinko" })}>パチンコ開始</Button>
        <Button onClick={() => moves.go({ kind: "live-new", game: "pachislot" })}>スロット開始</Button>
      </div>
      <section class="px-2 pt-4">
        <div class="flex items-center gap-2 px-2 pb-1">
          <h2 class="mr-auto shrink-0 text-xs font-bold uppercase tracking-wide text-text-muted">
            本日
            <Show when={dayNote()} keyed>
              {(note) => <span class="mx-1 font-normal tabular-nums">{note}</span>}
            </Show>
            の稼働
          </h2>
          <Show when={app.crossing} keyed>
            {(crossing) => (
            <>
            <Button variant="outline" size="small" class={cn("h-7 min-w-0 px-2", app.huddle.now() !== undefined && SWITCHED_ON)} onClick={() => (app.huddle.now() === undefined ? setHuddling(true) : moves.go({ kind: "huddle" }))}>
              <Show when={app.huddle.now()} keyed fallback={HUDDLE_OPEN}>
                {(huddle) => (
                  <span class="flex min-w-0">
                    {HUDDLE_JOINED}（<span class="truncate">{huddle.name}</span>）
                  </span>
                )}
              </Show>
            </Button>
            <HuddleDialog open={huddling()} crossing={crossing} onClosed={() => setHuddling(false)} />
            </>
            )}
          </Show>
        </div>
        <Loaded outcome={drafts()}>
          {(found) => (
            <Show when={listedOf(found, followed(), app.bookLines.arrived()).length > 0} fallback={<p class="px-2 py-1.5 text-sm text-text-muted">本日の稼働はありません。</p>}>
              <ul class="flex flex-col gap-0.5">
                <For each={listedOf(found, followed(), app.bookLines.arrived())}>
                  {(listed) => (
                    <DraftRow
                      listed={listed}
                      leftOver={listed.kind === "own" && isLeftOver(listed.draft, app.services.businessDay())}
                      selected={openPlay(props.place) === listed.draft.id}
                      sending={sendingOf(listed)}
                      onSelect={() => moves.go({ kind: "live-play", playId: listed.draft.id })}
                      onAbandon={() => setAbandoning(listed.draft)}
                      onSend={() => pressSend(listed.draft)}
                    />
                  )}
                </For>
              </ul>
              <Show when={found.some((draft) => isLeftOver(draft, app.services.businessDay()))}>
                <p class="mt-2 px-2 text-xs leading-5 text-text-muted">
                  前の日のまだ記帳していない稼働に
                  <span role="img" aria-label="赤い印" class="mx-0.5 inline-block size-2 rounded-full bg-negative align-baseline" />
                  がついています。開いて「遊技を終了」から記帳するか、長押しで削除してください。
                </p>
              </Show>
            </Show>
          )}
        </Loaded>
      </section>
      <PanelDialog open={choosing() !== undefined} title={CHOOSE_DESTINATION} onClosed={() => setChoosing(undefined)}>
        <div class="flex flex-col gap-2">
          <For each={destinations()}>
            {(destination) => (
              <Button
                variant="outline"
                onClick={() => {
                  const draft = choosing()
                  if (draft !== undefined) void sendTo(draft, destination)
                }}
              >
                {titleText(destination.title)}
              </Button>
            )}
          </For>
          <div class="flex justify-end">
            <Button size="small" variant="secondary" onClick={() => setChoosing(undefined)}>
              {CHOOSE_DESTINATION_DECLINE}
            </Button>
          </div>
        </div>
      </PanelDialog>
      <Show when={stopping()} keyed>
        {(asked) => (
          <ConfirmDialog
            open
            title={stopSendingWording(asked.destination.title).question}
            confirm={stopSendingWording(asked.destination.title).confirm}
            decline={stopSendingWording(asked.destination.title).decline}
            onConfirmed={() => void stopSending(asked.draft)}
            onDeclined={() => setStopping(undefined)}
          >
            <p>{stopSendingWording(asked.destination.title).body}</p>
          </ConfirmDialog>
        )}
      </Show>
      <ConfirmDialog
        open={abandoning() !== undefined}
        title="この稼働を削除しますか？"
        confirm="削除する"
        decline="やめる"
        onConfirmed={() => {
          const draft = abandoning()
          if (draft !== undefined) void abandon(draft)
        }}
        onDeclined={() => setAbandoning(undefined)}
      >
        <p>{((draft) => (draft === undefined ? "" : draftName(draft, app.machineNames())))(abandoning())}</p>
        <p>{abandoning()?.recorded === undefined ? "ここまでの記録は帳簿に書かれずに消えます。元には戻せません。" : "本日の稼働から外します。帳簿に記帳した分はそのまま残ります。"}</p>
        <Show when={app.huddle.now() !== undefined}>
          <p>{HUDDLE_GIVEN_UP}</p>
        </Show>
      </ConfirmDialog>
    </SidePanel>
  )
}
