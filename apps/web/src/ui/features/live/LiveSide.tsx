import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { abandonPlay, loadTodaysPlays } from "../../../application/live-play"
import { loadFollowedToday } from "../../../application/play-line"
import { destinationsOf } from "../../../application/sending"
import { shownNameOf, type MachineNames } from "../../../core/catalog/catalog"
import { afterItFinished, isLeftOver, isSentAsItStands, parlorOf, type PlayDraft } from "../../../core/live-play/draft"
import type { IsoDate } from "../../../core/calendar/calendar"
import type { Followed } from "../../../core/play-line/following"
import { Ok } from "../../../core/result/result"
import type { Destination } from "../../../sync/port/destination-store"
import { useApp } from "../../context"
import { Button, SWITCHED_ON } from "../../primitives/button"
import { cn } from "../../primitives/cn"
import { ConfirmDialog } from "../../primitives/dialog"
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
import { HUDDLE_GIVEN_UP, HUDDLE_HEADING, HUDDLE_JOINED } from "../../wording/huddle"
import { HuddleDialog } from "../huddle/HuddleDialog"
import { captionOf } from "./play-caption"
import { cabinetText } from "../../wording/cabinet"
import { seal } from "../../../mummer"
import { memberNameText, titleText } from "../../wording/book"
import { FOLLOWED_CHIP, FOLLOWED_UNHEARD_MARK, RECORDED_MARK } from "../../wording/play-line"
import { SENDING } from "../../wording/sync"

const openPlay = (place: Place): string | undefined =>
  place.kind === "live-play" || place.kind === "live-record" || place.kind === "live-cabinet" ? place.playId : undefined

/** What stands beside a play's place and time, each a word: where it is in its day, and whose it is where it came from someone else. */
const marksOf = (draft: PlayDraft, destinations: readonly Destination[]): readonly string[] => [
  ...(draft.received === undefined ? [] : [draft.received.sender === undefined ? "届いた稼働" : memberNameText(draft.received.sender)]),
  ...(draft.recorded === undefined ? [] : [RECORDED_MARK]),
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
  /** Whether the play is on its way now: its plane is still until the answer comes. */
  readonly sending: boolean
  readonly onSend: () => void
}): JSX.Element {
  const app = useApp()
  const hold = createLongPress(() => props.onAbandon())
  const flagged = (): boolean => props.leftOver || (props.draft.received !== undefined && afterItFinished(props.draft).length > 0)
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
          <span class="truncate">{shownNameOf(app.machineNames(), props.draft.machine)}</span>
        </span>
        <span class="truncate text-xs text-text-muted">{captionOf(props.draft, app.services.businessDay())}</span>
        <Show when={marksOf(props.draft, props.destinations).length > 0}>
          <span class="truncate text-xs text-text-secondary">{marksOf(props.draft, props.destinations).join("・")}</span>
        </Show>
      </button>
      <Show when={sendable()}>
        <button
          type="button"
          onClick={() => props.onSend()}
          aria-busy={props.sending}
          class="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded text-text-secondary hover:bg-surface-0 hover:text-text-primary [&_svg]:size-4"
          classList={{ "animate-pulse opacity-50": props.sending }}
        >
          <SendIcon label={props.sending ? SENDING : "この稼働を送る"} />
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

/**
 * One of the day's plays another of the owner's devices holds: pressed, it
 * opens, to be watched there; held, nothing — it is not this device's to
 * give up — and it has no paper plane, being not this device's to send.
 * It says, beside its place and time, that it is measured elsewhere, and
 * that it is not up to date while this device cannot read its line.
 */
function FollowedRow(props: { readonly followed: Followed; readonly selected: boolean; readonly onSelect: () => void }): JSX.Element {
  const app = useApp()
  const marks = (): readonly string[] => [FOLLOWED_CHIP, ...(props.followed.play.recorded === undefined ? [] : [RECORDED_MARK]), ...(app.playLine.heard().type === "unreached" ? [FOLLOWED_UNHEARD_MARK] : [])]
  return (
    <li>
      <button
        type="button"
        aria-current={props.selected ? "page" : undefined}
        onClick={() => props.onSelect()}
        class="flex w-full select-none flex-col rounded px-2 py-1.5 text-left transition-colors [-webkit-touch-callout:none]"
        classList={{ "bg-surface-3 text-text-primary": props.selected, "text-text-muted hover:bg-surface-3/60 hover:text-text-secondary": !props.selected }}
      >
        <span class="truncate text-[15px]">{shownNameOf(app.machineNames(), props.followed.play.machine)}</span>
        <span class="truncate text-xs text-text-muted">{captionOf(props.followed.play, app.services.businessDay())}</span>
        <span class="truncate text-xs text-text-secondary">{marks().join("・")}</span>
      </button>
    </li>
  )
}

/** A row of the day's list: a play this device holds, or one another of the owner's devices does. */
type DayRow = { readonly type: "held"; readonly draft: PlayDraft } | { readonly type: "followed"; readonly followed: Followed }

const startedAtOf = (row: DayRow): string => (row.type === "held" ? row.draft.startedAt : row.followed.play.startedAt)

/** The day's plays held here and followed from elsewhere as one list, newest begun first. */
const dayRowsOf = (held: readonly PlayDraft[], followed: readonly Followed[]): readonly DayRow[] =>
  [...held.map((draft): DayRow => ({ type: "held", draft })), ...followed.map((each): DayRow => ({ type: "followed", followed: each }))].toSorted((left, right) => startedAtOf(right).localeCompare(startedAtOf(left)))

/** The day's plays on this device, and the copies it keeps of those another of the owner's devices holds. */
const loadDayRows = async (drafts: Parameters<typeof loadTodaysPlays>[0], follow: Parameters<typeof loadFollowedToday>[0], businessDay: IsoDate): Promise<Outcome<{ readonly held: readonly PlayDraft[]; readonly rows: readonly DayRow[] }>> => {
  const held = await loadTodaysPlays(drafts, businessDay)
  if (!held.ok) return held
  const followed = await loadFollowedToday(follow, businessDay)
  if (!followed.ok) return followed
  return Ok({ held: held.value, rows: dayRowsOf(held.value, followed.value) })
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
 * recorded again. A play left over from a day before is marked red, and
 * the list ends by saying what the mark is and what to do about it — a
 * mark alone tells a person seeing it for the first time nothing. ノリ打ち
 * is begun or joined from its heading; once in one, the same button leads
 * to its room, where the others' plays are. Where the device may send plays to someone, each has its
 * paper plane, and none sends them all at once: a play is sent as it is
 * played; with more than one place to send to, the person is asked
 * which, and only then. A play another of the owner's devices holds is
 * listed among them, to be opened and watched, and nothing else.
 */
export function LiveSide(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  /** The hours as they strike: the day the list is of may turn on any of them. */
  const hour = createHourStruck()
  const [drafts] = createResource(() => [app.revision(), hour()] as const, () => loadDayRows(app.services.drafts, app.services.playLine.follow, app.services.businessDay()))
  const [destinations] = createResource(() => app.revision(), () => destinationsOf(app.services.destinations))
  const sendingTo = (): readonly Destination[] => ((found) => (found?.ok === true ? found.value : []))(destinations())
  /** The business day said after the list's 「本日」 once the device's clock is past midnight, read again as each hour strikes. */
  const dayNote = (): string | undefined => {
    hour()
    return businessDayNote(app.services.businessDay(), app.services.today())
  }
  /** The play a person asked to give up, until they say yes or no. */
  const [abandoning, setAbandoning] = createSignal<PlayDraft | undefined>(undefined)
  /** Whether ノリ打ち is open. */
  const [huddling, setHuddling] = createSignal(false)
  /** The play a person asked to send, while they are asked where to. */
  const [choosing, setChoosing] = createSignal<PlayDraft | undefined>(undefined)
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
  const sendingNow = app.sending
  const sendTo = async (draft: PlayDraft, destination: Destination): Promise<void> => {
    setChoosing(undefined)
    await sendingNow.send(draft, destination)
  }
  const send = (draft: PlayDraft): void => {
    if (sendingNow.busy(draft.id)) return
    const [only, ...others] = sendingTo()
    if (only !== undefined && others.length === 0) void sendTo(draft, only)
    else setChoosing(draft)
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
          <Show when={app.services.relayUrl !== undefined}>
            <Button variant="outline" size="small" class={cn("h-7 min-w-0 px-2", app.huddle.now() !== undefined && SWITCHED_ON)} onClick={() => (app.huddle.now() === undefined ? setHuddling(true) : moves.go({ kind: "huddle" }))}>
              <Show when={app.huddle.now()} keyed fallback={HUDDLE_HEADING}>
                {(huddle) => (
                  <span class="flex min-w-0">
                    {HUDDLE_JOINED}（<span class="truncate">{huddle.name}</span>）
                  </span>
                )}
              </Show>
            </Button>
            <HuddleDialog open={huddling()} onClosed={() => setHuddling(false)} />
          </Show>
        </div>
        <Show when={choosing()} keyed>
          {(draft) => (
            <div class="mb-2 flex flex-col gap-1 rounded-md border border-border p-2">
              <span class="text-xs text-text-muted">どこに送りますか？</span>
              <div class="flex flex-wrap gap-1.5">
                <For each={sendingTo()}>
                  {(destination) => (
                    <Button variant="outline" size="small" onClick={() => void sendTo(draft, destination)}>
                      {titleText(destination.title)}
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
            <Show when={found.rows.length > 0} fallback={<p class="px-2 py-1.5 text-sm text-text-muted">本日の稼働はありません。</p>}>
              <ul class="flex flex-col gap-0.5">
                <For each={found.rows}>
                  {(row) =>
                    row.type === "held" ? (
                      <DraftRow
                        draft={row.draft}
                        leftOver={isLeftOver(row.draft, app.services.businessDay())}
                        destinations={sendingTo()}
                        selected={openPlay(props.place) === row.draft.id}
                        onSelect={() => moves.go({ kind: "live-play", playId: row.draft.id })}
                        onAbandon={() => setAbandoning(row.draft)}
                        sending={sendingNow.busy(row.draft.id)}
                        onSend={() => send(row.draft)}
                      />
                    ) : (
                      <FollowedRow followed={row.followed} selected={openPlay(props.place) === row.followed.id} onSelect={() => moves.go({ kind: "live-play", playId: row.followed.id })} />
                    )
                  }
                </For>
              </ul>
              <Show when={found.held.some((draft) => isLeftOver(draft, app.services.businessDay()))}>
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
        <Show when={app.huddle.now() !== undefined && abandoning()?.received === undefined}>
          <p>{HUDDLE_GIVEN_UP}</p>
        </Show>
      </ConfirmDialog>
    </SidePanel>
  )
}
