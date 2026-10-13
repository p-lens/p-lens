import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import { abandonPlay, loadTodaysPlays } from "../../../application/live-play"
import { destinationsOf, sendDraft, sendTodaysPlays } from "../../../application/sending"
import { shownNameOf, type MachineNames } from "../../../core/catalog/catalog"
import { afterItEnded, isLeftOver, isSentAsItStands, parlorOf, type PlayDraft } from "../../../core/live-play/draft"
import type { Destination } from "../../../sync/port/destination-store"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ConfirmDialog } from "../../primitives/dialog"
import { createHourStruck } from "../../primitives/hour"
import { CloseIcon, SendIcon } from "../../primitives/icons"
import { createLongPress } from "../../primitives/long-press"
import { Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { businessDayNote, formatMoment } from "../../wording/dates"
import { describeError } from "../../wording/errors"
import { parlorText } from "../../wording/parlor"
import { sendingPortsOf } from "./sending-ports"

const openPlay = (place: Place): string | undefined =>
  place.kind === "live-play" || place.kind === "live-record" || place.kind === "live-cabinet" ? place.playId : undefined

/** What stands beside a play's place and time, each a word: where it is in its day, and whose it is where it came from someone else. */
const marksOf = (draft: PlayDraft, destinations: readonly Destination[]): readonly string[] => [
  ...(draft.received === undefined ? [] : [draft.received.sender ?? "届いた稼働"]),
  ...(draft.recorded === undefined ? [] : ["記帳済み"]),
  ...(destinations.some((destination) => isSentAsItStands(draft, destination.lineId)) ? ["送信済み"] : []),
  ...(draft.received?.again === undefined ? [] : ["送り直しあり"]),
]

/**
 * One of the day's plays: pressed, it opens; held — by a finger or a mouse
 * — it asks to be given up, and where a pointer can hover, a small cross
 * shows there for the same. A red dot stands before one left over from a
 * day before, still to be recorded, and before one that arrived changed
 * after it was over. Where the device may send plays to someone, a paper
 * plane sends this one.
 */
function DraftRow(props: {
  readonly draft: PlayDraft
  readonly leftOver: boolean
  readonly destinations: readonly Destination[]
  readonly selected: boolean
  readonly onSelect: () => void
  readonly onAbandon: () => void
  readonly onSend: () => void
}): JSX.Element {
  const app = useApp()
  const hold = createLongPress(() => props.onAbandon())
  const flagged = (): boolean => props.leftOver || (props.draft.received !== undefined && afterItEnded(props.draft).length > 0)
  const sendable = (): boolean => props.destinations.length > 0 && props.draft.received === undefined
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
        classList={{ "bg-surface-3 text-text-primary": props.selected, "text-text-muted hover:bg-surface-3/60 hover:text-text-secondary": !props.selected, "pr-9": sendable() }}
      >
        <span class="flex items-center gap-1.5 truncate text-[15px]">
          <Show when={flagged()}>
            <span class="size-2 shrink-0 rounded-full bg-negative" role="img" aria-label={props.leftOver ? "前の日の、まだ記帳していない稼働" : "終了後に変更のある稼働"} />
          </Show>
          <span class="truncate">
            {shownNameOf(app.machineNames(), props.draft.machine)}
            {props.draft.cabinetNumber === undefined ? "" : ` ${props.draft.cabinetNumber}番台`}
          </span>
        </span>
        <span class="truncate text-xs text-text-muted">
          {parlorText(parlorOf(props.draft))}・{formatMoment(props.draft.startedAt)}〜
        </span>
        <Show when={marksOf(props.draft, props.destinations).length > 0}>
          <span class="truncate text-xs text-text-secondary">{marksOf(props.draft, props.destinations).join("・")}</span>
        </Show>
      </button>
      <Show when={sendable()}>
        <button type="button" onClick={() => props.onSend()} class="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded text-text-secondary hover:bg-surface-0 hover:text-text-primary [&_svg]:size-4">
          <SendIcon label="この稼働を送る" />
        </button>
      </Show>
      <button
        type="button"
        aria-label="この稼働を削除"
        title="この稼働を削除"
        onClick={() => props.onAbandon()}
        class="absolute right-0.5 top-0.5 hidden size-5 items-center justify-center rounded text-text-muted hover:bg-surface-0 hover:text-text-primary focus-visible:flex group-hover:flex [&_svg]:size-3.5"
      >
        <CloseIcon label="" />
      </button>
    </li>
  )
}

/** A play as a sentence names it: its machine, as the halls call it, and cabinet, or its parlor where it has no machine. */
const draftName = (draft: PlayDraft, machineNames: MachineNames): string => {
  const machine = `${shownNameOf(machineNames, draft.machine)}${draft.cabinetNumber === undefined ? "" : ` ${draft.cabinetNumber}番台`}`.trim()
  return machine === "" ? parlorText(parlorOf(draft)) : machine
}

/** What is waiting to be sent while the person says where to: one play, or every play of the day not yet sent as it stands. */
type Sending = { readonly type: "one"; readonly draft: PlayDraft } | { readonly type: "all" }

/**
 * The day's plays on this device, newest begun first, and the way to start
 * another of either game: every play still to be recorded, and those
 * recorded since the business day turned, which stay to be set right and
 * recorded again. A play left over from a day before is marked red, and
 * the list ends by saying what the mark is and what to do about it — a
 * mark alone tells a person seeing it for the first time nothing. Where the device may send plays to someone, each has its
 * paper plane and the list has one for all of them; with more than one
 * place to send to, the person is asked which, and only then.
 */
export function LiveSide(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  /** The hours as they strike: the day the list is of may turn on any of them. */
  const hour = createHourStruck()
  const [drafts] = createResource(() => [app.revision(), hour()] as const, () => loadTodaysPlays(app.services.drafts, app.services.businessDay()))
  const [destinations] = createResource(() => app.revision(), () => destinationsOf(app.services.destinations))
  const sendingTo = (): readonly Destination[] => ((found) => (found?.ok === true ? found.value : []))(destinations())
  /** The business day said after the list's 「本日」 once the device's clock is past midnight, read again as each hour strikes. */
  const dayNote = (): string | undefined => {
    hour()
    return businessDayNote(app.services.businessDay(), app.services.today())
  }
  /** The play a person asked to give up, until they say yes or no. */
  const [abandoning, setAbandoning] = createSignal<PlayDraft | undefined>(undefined)
  /** What a person asked to send, while they are asked where to. */
  const [choosing, setChoosing] = createSignal<Sending | undefined>(undefined)
  const abandon = async (draft: PlayDraft): Promise<void> => {
    setAbandoning(undefined)
    const gone = await abandonPlay(app.services.drafts, draft.id)
    if (!gone.ok) {
      toast({ title: "稼働を削除できませんでした", description: describeError(gone.error), tone: "error" })
      return
    }
    app.wrote()
    if (openPlay(props.place) === draft.id) moves.go({ kind: "live" })
  }
  const sendTo = async (sending: Sending, destination: Destination): Promise<void> => {
    setChoosing(undefined)
    const sent = sending.type === "one" ? await sendDraft(sendingPortsOf(app.services), sending.draft, destination) : await sendTodaysPlays(sendingPortsOf(app.services), destination, app.services.businessDay())
    if (!sent.ok) {
      toast({ title: "送れませんでした", description: describeError(sent.error), tone: "error" })
      return
    }
    toast(typeof sent.value === "number" ? { title: sent.value === 0 ? "送る稼働はありません" : `${sent.value}件を送りました`, description: destination.title } : { title: "送りました", description: destination.title })
    app.wrote()
  }
  const send = (sending: Sending): void => {
    const [only, ...others] = sendingTo()
    if (only !== undefined && others.length === 0) void sendTo(sending, only)
    else setChoosing(sending)
  }
  return (
    <SidePanel header={<span class="font-semibold text-text-primary">稼働</span>} resizeLabel="サイドパネルの幅を変える">
      <div class="grid grid-cols-2 gap-2 px-2 pt-3">
        <Button onClick={() => moves.go({ kind: "live-new", game: "pachinko" })}>パチンコ開始</Button>
        <Button onClick={() => moves.go({ kind: "live-new", game: "slot" })}>スロット開始</Button>
      </div>
      <section class="px-2 pt-4">
        <div class="flex items-center justify-between px-2 pb-1">
          <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">
            本日
            <Show when={dayNote()} keyed>
              {(note) => <span class="mx-1 font-normal tabular-nums">{note}</span>}
            </Show>
            の稼働
          </h2>
          <Show when={sendingTo().length > 0}>
            <button type="button" onClick={() => send({ type: "all" })} class="flex size-7 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4">
              <SendIcon label="本日の稼働をまとめて送る" />
            </button>
          </Show>
        </div>
        <Show when={choosing()} keyed>
          {(sending) => (
            <div class="mb-2 flex flex-col gap-1 rounded-md border border-border p-2">
              <span class="text-xs text-text-muted">どこに送りますか？</span>
              <div class="flex flex-wrap gap-1.5">
                <For each={sendingTo()}>
                  {(destination) => (
                    <Button variant="outline" size="small" onClick={() => void sendTo(sending, destination)}>
                      {destination.title}
                    </Button>
                  )}
                </For>
                <Button variant="ghost" size="small" onClick={() => setChoosing(undefined)}>
                  やめる
                </Button>
              </div>
            </div>
          )}
        </Show>
        <Loaded outcome={drafts()}>
          {(found) => (
            <Show when={found.length > 0} fallback={<p class="px-2 py-1.5 text-sm text-text-muted">本日の稼働はありません。</p>}>
              <ul class="flex flex-col gap-0.5">
                <For each={found}>
                  {(draft) => (
                    <DraftRow
                      draft={draft}
                      leftOver={isLeftOver(draft, app.services.businessDay())}
                      destinations={sendingTo()}
                      selected={openPlay(props.place) === draft.id}
                      onSelect={() => moves.go({ kind: "live-play", playId: draft.id })}
                      onAbandon={() => setAbandoning(draft)}
                      onSend={() => send({ type: "one", draft })}
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
      </ConfirmDialog>
    </SidePanel>
  )
}
