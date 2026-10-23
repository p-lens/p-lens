import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { loadTodaysPlays } from "../../../application/live-play"
import { forgetDestination, sendDraft } from "../../../application/sending"
import { shownNameOf } from "../../../core/catalog/catalog"
import { awaitsSending, deliveryOf, type PlayDraft } from "../../../core/live-play/draft"
import type { Destination } from "../../../sync/port/destination-store"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ConfirmDialog } from "../../primitives/dialog"
import { createHourStruck } from "../../primitives/hour"
import { SendIcon } from "../../primitives/icons"
import { Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import { businessDayNote } from "../../wording/dates"
import { describeError } from "../../wording/errors"
import { deliveryText } from "../../wording/sync"
import { captionOf } from "./play-caption"
import { sendingPortsOf } from "./sending-ports"
import { titleText } from "../../wording/book"

/**
 * One of the day's plays as it stands with a book it may be sent to: what
 * and where it is, whether it has gone there, and — where it waits to — the
 * paper plane that sends it.
 */
function DeliveryRow(props: { readonly draft: PlayDraft; readonly lineId: string; readonly onSend: () => void }): JSX.Element {
  const app = useApp()
  return (
    <li class="flex items-center gap-1 rounded px-2 py-1.5">
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[15px] text-text-primary">{shownNameOf(app.machineNames(), props.draft.machine)}</span>
        <span class="truncate text-xs text-text-muted">{captionOf(props.draft, app.services.businessDay())}</span>
        <span class="truncate text-xs" classList={{ "text-text-secondary": awaitsSending(props.draft, props.lineId), "text-text-muted": !awaitsSending(props.draft, props.lineId) }}>
          {deliveryText(deliveryOf(props.draft, props.lineId))}
        </span>
      </div>
      <Show when={awaitsSending(props.draft, props.lineId)}>
        <button type="button" onClick={() => props.onSend()} class="flex size-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4">
          <SendIcon label="この稼働を送る" />
        </button>
      </Show>
    </li>
  )
}

/**
 * The day's plays of this device's own, and how each stands with one book
 * they may be sent to, each sent with its own plane: none are sent at
 * once, as a play is sent as it is played.
 * Below them, the way to let go of the book.
 */
function Outbox(props: { readonly destination: Destination }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  /** The hours as they strike: the day the list is of may turn on any of them. */
  const hour = createHourStruck()
  const [drafts] = createResource(() => [app.revision(), hour()] as const, () => loadTodaysPlays(app.services.drafts, app.services.businessDay()))
  const own = (found: readonly PlayDraft[]): readonly PlayDraft[] => found.filter((draft) => draft.received === undefined)
  /** The business day said after the list's 「本日」 once the device's clock is past midnight, read again as each hour strikes. */
  const dayNote = (): string | undefined => {
    hour()
    return businessDayNote(app.services.businessDay(), app.services.today())
  }
  /** Whether the person is being asked if the book is to be let go of. */
  const [forgetting, setForgetting] = createSignal(false)
  const sendOne = async (draft: PlayDraft): Promise<void> => {
    const sent = await sendDraft(sendingPortsOf(app.services), draft, props.destination)
    if (!sent.ok) {
      toast({ title: "送れませんでした", description: describeError(sent.error), tone: "error" })
      return
    }
    toast({ title: "送りました", description: titleText(props.destination.title) })
    app.played()
  }
  const forget = async (): Promise<void> => {
    setForgetting(false)
    const gone = await forgetDestination(app.services.destinations, props.destination)
    if (!gone.ok) {
      toast({ title: "送り先から外せませんでした", description: describeError(gone.error), tone: "error" })
      return
    }
    app.played()
    moves.go({ kind: "live" })
  }
  return (
    <>
      <p class="px-4 pt-3 text-xs text-text-muted">この帳簿の中身は、この端末からは見えません。本日の稼働を送れます。</p>
      <section class="px-2 pt-4">
        <Loaded outcome={drafts()}>
          {(found) => (
            <>
              <div class="flex min-h-8 items-center px-2 pb-1">
                <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">
                  本日
                  <Show when={dayNote()} keyed>
                    {(note) => <span class="mx-1 font-normal tabular-nums">{note}</span>}
                  </Show>
                  の稼働
                </h2>
              </div>
              <Show when={own(found).length > 0} fallback={<p class="px-2 py-1.5 text-sm text-text-muted">本日の稼働はありません。</p>}>
                <ul class="flex flex-col gap-0.5">
                  <For each={own(found)}>{(draft) => <DeliveryRow draft={draft} lineId={props.destination.lineId} onSend={() => void sendOne(draft)} />}</For>
                </ul>
              </Show>
            </>
          )}
        </Loaded>
      </section>
      <div class="flex justify-end px-4 pb-4 pt-6">
        <Button size="small" variant="outline" onClick={() => setForgetting(true)}>
          送り先から外す
        </Button>
      </div>
      <ConfirmDialog open={forgetting()} title="この送り先を外しますか？" confirm="外す" decline="やめる" onConfirmed={() => void forget()} onDeclined={() => setForgetting(false)}>
        <p>{titleText(props.destination.title)}</p>
        <p>もう一度送るには、招待コードをあらためて追加します。すでに送った稼働は相手に残ります。</p>
      </ConfirmDialog>
    </>
  )
}

/**
 * The side panel of a book this device may only send plays to: its title,
 * and the day's plays to send there. Nothing of the book itself, which a
 * sender is never shown. A line the device no longer keeps says so.
 */
export function DestinationSide(props: { readonly lineId: string; readonly destinations: Outcome<readonly Destination[]> | undefined }): JSX.Element {
  const destination = (): Destination | undefined => (props.destinations?.ok === true ? props.destinations.value.find((candidate) => candidate.lineId === props.lineId) : undefined)
  return (
    <SidePanel header={<span class="truncate font-semibold text-text-primary">{((found) => (found === undefined ? "稼働の送り先" : titleText(found.title)))(destination())}</span>} resizeLabel="サイドパネルの幅を変える">
      <Loaded outcome={props.destinations}>
        {() => (
          <Show when={destination()} keyed fallback={<p class="px-4 py-3 text-sm text-text-muted">この送り先は、この端末にありません。</p>}>
            {(found) => <Outbox destination={found} />}
          </Show>
        )}
      </Loaded>
    </SidePanel>
  )
}
