import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { roleIn, type BookId, type ListedBook } from "../../../core/book/book"
import { Ok } from "../../../core/result/result"
import { isOwnersLink, startSync, stopSync, syncCodeOf, type CrossingServices, type OwnersLink } from "../../../crossing"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { copyText } from "../../primitives/clipboard"
import { ConfirmDialog, PanelDialog } from "../../primitives/dialog"
import { QrCode } from "../../primitives/qr-code"
import { toast } from "../../primitives/toast"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { describeError } from "../../wording/errors"
import {
  CLOSE_SYNC_CODE,
  CONFLICT_NOT_SETTLED,
  CONFLICT_SETTINGS_UNREADABLE,
  COPY_SYNC_CODE,
  describeBookSyncProblem,
  JOIN_ABOUT,
  JOIN_HEADING,
  JOINED_BOOK,
  OWN_BOOKS,
  SHOW_SYNC_CODE,
  standingText,
  START_SYNC,
  STARTING_SYNC,
  STOP_SYNC,
  stopSyncWording,
  SYNC_CODE_COPIED,
  SYNC_CODE_FIELD,
  SYNC_CODE_HOW,
  SYNC_CODE_NOT_COPIED,
  SYNC_CODE_TITLE,
  SYNC_CODE_WARNING,
  SYNC_INTRO,
  SYNC_NOT_IN_IMAGE,
  SYNC_NOT_JOINED,
  SYNC_NOT_STARTED,
  SYNC_NOT_STOPPED,
  SYNC_SCANNING,
  SYNC_STOPPED,
} from "../../wording/sync"
import { joinedInboxText } from "../../wording/sharing"
import { Withheld } from "../mummer/Withheld"
import { ViewHeader } from "../shell/ViewHeader"
import { ConflictPanel } from "./ConflictPanel"
import { JoinByCode, type JoinWording } from "./JoinByCode"
import { settleConflict } from "./settle-conflict"

/** A book of one's own as the screen lists it: its cover, and its link where this device keeps it on a line. */
interface Listed {
  readonly book: ListedBook
  readonly link: OwnersLink | undefined
}

/** What joining one's own book from another of one's devices says. */
const JOIN_OWN: JoinWording = { about: JOIN_ABOUT, field: SYNC_CODE_FIELD, scanning: SYNC_SCANNING, notInImage: SYNC_NOT_IN_IMAGE, joined: (joined) => (joined.type === "book" ? { title: JOINED_BOOK } : joinedInboxText(joined)), notJoined: SYNC_NOT_JOINED }

/** The code a book's other devices join it by, as a QR code and as text, for a device with no camera; and that it is the book's key. */
function SyncCodeDialog(props: { readonly link: OwnersLink | undefined; readonly onClosed: () => void }): JSX.Element {
  const copy = async (code: string): Promise<void> => {
    const copied = await copyText(code)
    toast(copied.ok ? { title: SYNC_CODE_COPIED } : { title: SYNC_CODE_NOT_COPIED, tone: "error" })
  }
  return (
    <PanelDialog open={props.link !== undefined} title={SYNC_CODE_TITLE} onClosed={props.onClosed}>
      <Show when={props.link} keyed>
        {(link) => (
          <div class="flex flex-col gap-3">
            <QrCode text={syncCodeOf(link)} label={SYNC_CODE_TITLE} class="mx-auto w-56 max-w-full" />
            <p>{SYNC_CODE_HOW}</p>
            <p class="font-semibold text-negative">{SYNC_CODE_WARNING}</p>
            <div class="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="small" onClick={() => void copy(syncCodeOf(link))}>
                {COPY_SYNC_CODE}
              </Button>
              <Button size="small" onClick={props.onClosed}>
                {CLOSE_SYNC_CODE}
              </Button>
            </div>
          </div>
        )}
      </Show>
    </PanelDialog>
  )
}

/** One book of one's own: put on a line, or how its line stands, with its code, the way to stop, and its conflict where it has one. */
function BookRow(props: { readonly listed: Listed; readonly crossing: CrossingServices; readonly onChanged: () => void }): JSX.Element {
  const app = useApp()
  const [starting, setStarting] = createSignal(false)
  const [showing, setShowing] = createSignal<OwnersLink | undefined>(undefined)
  const [stopping, setStopping] = createSignal(false)
  const bookId = (): BookId => props.listed.book.id
  const standing = () => app.bookLines.standings().get(bookId())
  const start = async (): Promise<void> => {
    if (starting()) return
    setStarting(true)
    const started = await startSync(props.crossing.books, bookId())
    setStarting(false)
    if (!started.ok) return toast({ title: SYNC_NOT_STARTED, description: describeBookSyncProblem(started.error), tone: "error" })
    props.onChanged()
    app.bookLines.relinked()
    if (isOwnersLink(started.value)) setShowing(started.value)
  }
  const stop = async (): Promise<void> => {
    setStopping(false)
    app.bookLines.letGo(bookId())
    const stopped = await stopSync(props.crossing.books, bookId())
    if (!stopped.ok) return toast({ title: SYNC_NOT_STOPPED, description: describeBookSyncProblem(stopped.error), tone: "error" })
    app.bookLines.setStanding(bookId(), undefined)
    app.bookLines.setFollowed(bookId(), [])
    app.bookLines.relinked()
    props.onChanged()
    toast({ title: SYNC_STOPPED })
  }
  const wording = () => stopSyncWording(bookTitle(props.listed.book))
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 px-3 py-3">
      <div class="flex flex-wrap items-center justify-end gap-2">
        <span class="min-w-0 flex-1 truncate text-sm text-text-primary">{bookTitle(props.listed.book)}</span>
        <Show
          when={props.listed.link}
          keyed
          fallback={
            <Button size="small" variant="secondary" onClick={() => void start()} aria-busy={starting()}>
              {starting() ? STARTING_SYNC : START_SYNC}
            </Button>
          }
        >
          {(link) => (
            <>
              <Button size="small" variant="secondary" onClick={() => setShowing(link)}>
                {SHOW_SYNC_CODE}
              </Button>
              <Button size="small" variant="outline" onClick={() => setStopping(true)}>
                {STOP_SYNC}
              </Button>
            </>
          )}
        </Show>
      </div>
      <Show when={props.listed.link !== undefined ? standing() : undefined} keyed>
        {(now) => <p class="text-xs" classList={{ "text-text-muted": now.type !== "conflict" && now.type !== "stopped", "text-negative": now.type === "conflict" || now.type === "stopped" }}>{standingText(now)}</p>}
      </Show>
      <Show when={((now) => (now?.type === "conflict" ? now.conflict : undefined))(standing())} keyed>
        {(conflict) => <ConflictPanel conflict={conflict} onSettle={(files) => void settleConflict(app.bookLines, bookId(), files)} onUnreadable={() => toast({ title: CONFLICT_NOT_SETTLED, description: CONFLICT_SETTINGS_UNREADABLE, tone: "error" })} />}
      </Show>
      <SyncCodeDialog link={showing()} onClosed={() => setShowing(undefined)} />
      <ConfirmDialog open={stopping()} title={wording().question} confirm={wording().confirm} decline={wording().decline} onConfirmed={() => void stop()} onDeclined={() => setStopping(false)}>
        <p>{wording().body}</p>
      </ConfirmDialog>
    </li>
  )
}

/**
 * Syncing one's own books between one's own devices (PROTOCOL.md §5): which
 * of one's books go, how each one's line stands, the code another of one's
 * devices joins one by, and a book joined from such a code. A book the two
 * sides changed the same place of is settled here. What travels is sealed on
 * the device; the relay in between reads none of it. The codes are veiled
 * while mumming: each is a book's key.
 */
function OwnDevices(props: { readonly place: Place; readonly crossing: CrossingServices }): JSX.Element {
  const app = useApp()
  const [changed, setChanged] = createSignal(0)
  const [listed] = createResource(
    () => ({ revision: app.revision(), changed: changed(), linked: app.bookLines.linked() }),
    async (): Promise<Outcome<readonly Listed[]>> => {
      const [books, links] = await Promise.all([app.services.session.books(), props.crossing.books.lines.links()])
      if (!books.ok) return books
      const linked = links.ok ? links.value : []
      return Ok(books.value.filter((book) => roleIn(book, app.services.member) === "owner").map((book) => ({ book, link: linked.filter(isOwnersLink).find((link) => link.bookId === book.id) })))
    },
  )
  /** The books as last read, kept while they are read again, so that no row is drawn anew — and no code shown, or choice being made, let go of — as a book is written. */
  const rows = createMemo((): readonly Listed[] => ((found) => (found?.ok === true ? found.value : []))(listed.latest))
  const ids = createMemo((): readonly BookId[] => rows().map((row) => row.book.id), [], { equals: (one, other) => one.length === other.length && one.every((id, index) => id === other[index]) })
  const changedHere = (): void => {
    setChanged((count) => count + 1)
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="端末の同期" />}>
      <Withheld kind="invitation">
        <div class="max-w-5xl">
          <div class="flex flex-col gap-6 p-4">
            <p class="text-sm text-text-muted">{SYNC_INTRO}</p>
            <section class="flex flex-col gap-2">
              <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">{OWN_BOOKS}</h2>
              <Show when={((found) => (found?.ok === false ? found.error : undefined))(listed.latest)} keyed>
                {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
              </Show>
              <ul class="flex flex-col gap-1">
                <For each={ids()}>
                  {(bookId) => <Show when={rows().find((row) => row.book.id === bookId)}>{(row) => <BookRow listed={row()} crossing={props.crossing} onChanged={changedHere} />}</Show>}
                </For>
              </ul>
            </section>
            <section class="flex flex-col gap-2">
              <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">{JOIN_HEADING}</h2>
              <JoinByCode crossing={props.crossing} wording={JOIN_OWN} onJoined={changedHere} />
            </section>
          </div>
        </div>
      </Withheld>
    </MainContent>
  )
}

/** 端末の同期, where the build names a relay; where it names none, only that there is none to sync by. */
export function SyncSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  return (
    <Show
      when={app.crossing}
      keyed
      fallback={
        <MainContent header={<ViewHeader place={props.place} title="端末の同期" />}>
          <p class="p-4 text-sm text-text-muted">{describeBookSyncProblem({ type: "no-relay" })}</p>
        </MainContent>
      }
    >
      {(crossing) => <OwnDevices place={props.place} crossing={crossing} />}
    </Show>
  )
}
