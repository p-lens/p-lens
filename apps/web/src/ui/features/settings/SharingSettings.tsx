import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { roleIn, type BookId, type ListedBook } from "../../../core/book/book"
import { Ok } from "../../../core/result/result"
import { isOwnersLink, startSync, stopSync, type BookLine, type BookLink, type CrossingServices, type Destination, type InvitedRole, type MemberRole, type SharedMember } from "../../../crossing"
import { useApp } from "../../context"
import type { Place } from "../../navigation/place"
import { Button } from "../../primitives/button"
import { copyText } from "../../primitives/clipboard"
import { ConfirmDialog, PanelDialog } from "../../primitives/dialog"
import { createNudge } from "../../primitives/nudge"
import { QrCode } from "../../primitives/qr-code"
import { settleTyping, TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { bookTitle, memberNameText, titleText } from "../../wording/book"
import { describeError } from "../../wording/errors"
import {
  BOOKS_LET_INTO,
  CLOSE_INVITATION,
  CLOSE_MEMBERS,
  CONFLICT_WAITS,
  COPY_INVITATION,
  DESTINATION_FORGOTTEN,
  DESTINATION_NOT_FORGOTTEN,
  DESTINATION_REMOVED,
  DESTINATIONS_ABOUT,
  DESTINATIONS_HEADING,
  FORGET_DESTINATION,
  forgetDestinationWording,
  INVITATION_COPIED,
  INVITATION_HOW,
  INVITATION_NOT_COPIED,
  INVITATION_NOT_MADE,
  invitationMessage,
  invitationTitle,
  invitationWarning,
  INVITEE_NAME,
  JOIN_SHARED,
  JOIN_SHARED_HEADING,
  LEAVE,
  leaveWording,
  LEFT_BOOK,
  letInAsText,
  LINE_NOT_OPEN,
  MAKE_INVITATION,
  MAKING_INVITATION,
  NO_MEMBERS,
  NOT_LEFT,
  notRemovedText,
  OPEN_MEMBERS,
  OWN_BOOKS_TO_SHARE,
  PREPARING_SHARING,
  REMOVE,
  removedText,
  removeWording,
  REMOVING,
  ROLE_ABOUT,
  ROLE_LABEL,
  roleText,
  SHARING_INTRO,
  SENDING_COUNT,
  SHARING_NOT_STARTED,
  SHOW_INVITATION,
} from "../../wording/sharing"
import { CONFLICT_NOT_SETTLED, CONFLICT_SETTINGS_UNREADABLE, describeBookSyncProblem, standingText } from "../../wording/sync"
import { Withheld } from "../mummer/Withheld"
import { ViewHeader } from "../shell/ViewHeader"
import { ConflictPanel } from "./ConflictPanel"
import { JoinByCode } from "./JoinByCode"
import { settleConflict } from "./settle-conflict"

/** A book as the screen lists it: its cover, and its link where this device keeps it on a line. */
interface Listed {
  readonly book: ListedBook
  readonly link: BookLink | undefined
}

const isRole = (value: string | null): value is InvitedRole => value === "viewer" || value === "editor" || value === "sender"

/** A person's invitation code as a QR code, with what to do with it, the message to paste to them, and that it is theirs alone. */
function InvitationDialog(props: { readonly member: SharedMember | undefined; readonly title: string; readonly onClosed: () => void }): JSX.Element {
  const app = useApp()
  const copy = async (member: SharedMember): Promise<void> => {
    const copied = await copyText(invitationMessage(app.services.name, props.title, member.role, member.code))
    toast(copied.ok ? { title: INVITATION_COPIED } : { title: INVITATION_NOT_COPIED, tone: "error" })
  }
  return (
    <PanelDialog open={props.member !== undefined} title={invitationTitle(memberNameText(props.member?.name ?? ""))} onClosed={props.onClosed}>
      <Show when={props.member} keyed>
        {(member) => (
          <div class="flex flex-col gap-3">
            <QrCode text={member.code} label={invitationTitle(memberNameText(member.name))} class="mx-auto w-56 max-w-full" />
            <p>{INVITATION_HOW}</p>
            <p class="font-semibold text-negative">{invitationWarning(member.role)}</p>
            <div class="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="small" onClick={() => void copy(member)}>
                {COPY_INVITATION}
              </Button>
              <Button size="small" onClick={props.onClosed}>
                {CLOSE_INVITATION}
              </Button>
            </div>
          </div>
        )}
      </Show>
    </PanelDialog>
  )
}

/** What a press on the panel is doing: nothing, making an invitation, or taking one person out. */
type Working = { readonly type: "idle" } | { readonly type: "inviting" } | { readonly type: "removing"; readonly mailbox: string }

/**
 * Whom the owner let into a book, and the way to let in one more: a name
 * for the owner's own memory, whether they may write or only read, and a
 * code made for that person alone, shown as it is made. The names are
 * sealed in the book, for the owner's devices alone; the relay knows each
 * person by a key and a mailbox, never by name. Taken back out, a person
 * gets nothing written after, and the book moves to a new key.
 */
function MembersPanel(props: { readonly bookId: BookId; readonly line: BookLine; readonly title: string }): JSX.Element {
  const app = useApp()
  const [changed, setChanged] = createSignal(0)
  const [members] = createResource(
    () => ({ line: props.line, changed: changed(), revision: app.revision() }),
    (source) => source.line.members(),
  )
  const [name, setName] = createSignal("")
  const [role, setRole] = createSignal<InvitedRole>("viewer")
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  const [showing, setShowing] = createSignal<SharedMember | undefined>(undefined)
  /** The person the owner asked to take out, until they say yes or no. */
  const [removing, setRemoving] = createSignal<SharedMember | undefined>(undefined)
  const nudge = createNudge()
  const add = async (): Promise<void> => {
    settleTyping()
    if (working().type !== "idle") return
    if (name().trim() === "") return nudge.nudge()
    setWorking({ type: "inviting" })
    const made = await props.line.invite(name().trim(), role())
    setWorking({ type: "idle" })
    if (!made.ok) return toast({ title: INVITATION_NOT_MADE, description: describeBookSyncProblem(made.error), tone: "error" })
    setName("")
    setChanged((count) => count + 1)
    app.bookLines.rosterChanged(props.bookId)
    setShowing(made.value)
  }
  const remove = async (member: SharedMember): Promise<void> => {
    setRemoving(undefined)
    if (working().type !== "idle") return
    setWorking({ type: "removing", mailbox: member.mailbox })
    const gone = await props.line.remove(member.mailbox)
    setWorking({ type: "idle" })
    setChanged((count) => count + 1)
    app.bookLines.rosterChanged(props.bookId)
    toast(gone.ok ? { title: removedText(memberNameText(member.name)) } : { title: notRemovedText(memberNameText(member.name)), description: describeBookSyncProblem(gone.error), tone: "error" })
  }
  const wording = () => removeWording(memberNameText(removing()?.name ?? ""), removing()?.role ?? "viewer")
  return (
    <div class="flex flex-col gap-3 rounded-md border border-border p-3">
      <Show when={members.latest} keyed fallback={<p class="text-xs text-text-muted">{PREPARING_SHARING}</p>}>
        {(found) => (
          <Show when={found.length > 0} fallback={<p class="text-xs text-text-muted">{NO_MEMBERS}</p>}>
            <ul class="flex flex-col divide-y divide-border">
              <For each={found}>
                {(member) => (
                  <li class="flex items-center gap-2 py-1">
                    <span class="min-w-0 flex-1 break-words text-sm text-text-primary">{memberNameText(member.name)}</span>
                    <span class="shrink-0 text-xs text-text-muted">{roleText(member.role)}</span>
                    <Button variant="outline" size="small" class="shrink-0" onClick={() => setShowing(member)}>
                      {SHOW_INVITATION}
                    </Button>
                    <Button variant="outline" size="small" class="shrink-0" onClick={() => setRemoving(member)} aria-busy={((now) => now.type === "removing" && now.mailbox === member.mailbox)(working())}>
                      {((now) => (now.type === "removing" && now.mailbox === member.mailbox ? REMOVING : REMOVE))(working())}
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        )}
      </Show>
      <form
        autocomplete="off"
        class="flex flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <div class="flex flex-wrap items-end justify-end gap-2">
          <div class="min-w-0 grow basis-48">
            <TextField label={INVITEE_NAME} value={name()} onChange={setName} invalid={nudge.red() && name().trim() === ""} onFocus={nudge.settle} maxLength={30} />
          </div>
          <div class="flex min-w-0 flex-wrap items-end justify-end gap-2">
            <ToggleGroup
              value={role()}
              onChange={(value: string | null) => {
                if (isRole(value)) setRole(value)
              }}
              aria-label={ROLE_LABEL}
            >
              <ToggleGroupItem value="viewer">{roleText("viewer")}</ToggleGroupItem>
              <ToggleGroupItem value="editor">{roleText("editor")}</ToggleGroupItem>
              <ToggleGroupItem value="sender">{roleText("sender")}</ToggleGroupItem>
            </ToggleGroup>
            <Button type="submit" variant="secondary" size="small" class="shrink-0" aria-busy={working().type === "inviting"}>
              {working().type === "inviting" ? MAKING_INVITATION : MAKE_INVITATION}
            </Button>
          </div>
        </div>
        <p class="text-xs text-text-muted">{ROLE_ABOUT}</p>
      </form>
      <InvitationDialog member={showing()} title={props.title} onClosed={() => setShowing(undefined)} />
      <ConfirmDialog
        open={removing() !== undefined}
        title={wording().question}
        confirm={wording().confirm}
        decline={wording().decline}
        onConfirmed={() => {
          const member = removing()
          if (member !== undefined) void remove(member)
        }}
        onDeclined={() => setRemoving(undefined)}
      >
        <p>{wording().body}</p>
      </ConfirmDialog>
    </div>
  )
}

/** The line a book is kept open on by the runner, read again as lines are opened and let go of. */
const openLineOf = (bookId: BookId): (() => BookLine | undefined) => {
  const app = useApp()
  return () => {
    app.bookLines.opened()
    return app.bookLines.held.lines.get(bookId)?.book
  }
}

/** One book of one's own, and the people let into it, opened under its row: a book not yet on a line is put on one as the row is opened. */
function OwnBookRow(props: { readonly listed: Listed; readonly crossing: CrossingServices; readonly onChanged: () => void }): JSX.Element {
  const app = useApp()
  const [opening, setOpening] = createSignal(false)
  const [open, setOpen] = createSignal(false)
  const line = openLineOf(props.listed.book.id)
  const toggle = async (): Promise<void> => {
    if (open()) {
      setOpen(false)
      return
    }
    if (opening()) return
    if (props.listed.link === undefined) {
      setOpening(true)
      const started = await startSync(props.crossing.books, props.listed.book.id)
      setOpening(false)
      if (!started.ok) return toast({ title: SHARING_NOT_STARTED, description: describeBookSyncProblem(started.error), tone: "error" })
      app.bookLines.relinked()
      props.onChanged()
    }
    setOpen(true)
  }
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 px-3 py-3">
      <div class="flex flex-wrap items-center justify-end gap-2">
        <span class="min-w-0 flex-1 truncate text-sm text-text-primary">{bookTitle(props.listed.book)}</span>
        <Button size="small" variant="secondary" onClick={() => void toggle()} aria-busy={opening()}>
          {opening() ? PREPARING_SHARING : open() ? CLOSE_MEMBERS : OPEN_MEMBERS}
        </Button>
      </div>
      <Show when={open()}>
        <Show when={line()} keyed fallback={<p class="text-xs text-text-muted">{LINE_NOT_OPEN}</p>}>
          {(opened) => <MembersPanel bookId={props.listed.book.id} line={opened} title={bookTitle(props.listed.book)} />}
        </Show>
      </Show>
    </li>
  )
}

/** A book one was let into: what one may do with it, how its line stands, its conflict where an editor's device may settle it, and the way to leave. */
function LetInRow(props: { readonly listed: Listed; readonly role: MemberRole; readonly crossing: CrossingServices; readonly onChanged: () => void }): JSX.Element {
  const app = useApp()
  const [leaving, setLeaving] = createSignal(false)
  const bookId = (): BookId => props.listed.book.id
  const standing = () => app.bookLines.standings().get(bookId())
  const leave = async (): Promise<void> => {
    setLeaving(false)
    app.bookLines.letGo(bookId())
    const stopped = await stopSync(props.crossing.books, bookId())
    if (!stopped.ok) return toast({ title: NOT_LEFT, description: describeBookSyncProblem(stopped.error), tone: "error" })
    app.bookLines.setStanding(bookId(), undefined)
    app.bookLines.relinked()
    props.onChanged()
    toast({ title: LEFT_BOOK })
  }
  const wording = () => leaveWording(bookTitle(props.listed.book))
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 px-3 py-3">
      <div class="flex flex-wrap items-center justify-end gap-2">
        <span class="min-w-0 flex-1 truncate text-sm text-text-primary">{bookTitle(props.listed.book)}</span>
        <span class="shrink-0 text-xs text-text-muted">{letInAsText(props.role)}</span>
        <Button size="small" variant="outline" onClick={() => setLeaving(true)}>
          {LEAVE}
        </Button>
      </div>
      <Show when={standing()} keyed>
        {(now) => (
          <p class="text-xs" classList={{ "text-text-muted": now.type !== "conflict" && now.type !== "stopped", "text-negative": now.type === "conflict" || now.type === "stopped" }}>
            {now.type === "conflict" && props.role === "viewer" ? CONFLICT_WAITS : standingText(now)}
          </p>
        )}
      </Show>
      <Show when={((now) => (now?.type === "conflict" && props.role === "editor" ? now.conflict : undefined))(standing())} keyed>
        {(conflict) => <ConflictPanel conflict={conflict} onSettle={(files) => void settleConflict(app.bookLines, bookId(), files)} onUnreadable={() => toast({ title: CONFLICT_NOT_SETTLED, description: CONFLICT_SETTINGS_UNREADABLE, tone: "error" })} />}
      </Show>
      <ConfirmDialog open={leaving()} title={wording().question} confirm={wording().confirm} decline={wording().decline} onConfirmed={() => void leave()} onDeclined={() => setLeaving(false)}>
        <p>{wording().body}</p>
      </ConfirmDialog>
    </li>
  )
}

/** A book's inbox this device sends plays to: its title, how many plays go there, or that the owner took the person out; and the way to let it go. */
function DestinationRow(props: { readonly destination: Destination; readonly crossing: CrossingServices }): JSX.Element {
  const app = useApp()
  const [forgetting, setForgetting] = createSignal(false)
  const sending = (): number => app.bookLines.sent().filter((play) => play.invitation === props.destination.invitation && !play.ended).length
  const forget = async (): Promise<void> => {
    setForgetting(false)
    app.bookLines.letSendingGo(props.destination.invitation)
    const forgotten = await props.crossing.books.lines.forgetDestination(props.destination.invitation)
    app.bookLines.relinked()
    toast(forgotten.ok ? { title: DESTINATION_FORGOTTEN } : { title: DESTINATION_NOT_FORGOTTEN, tone: "error" })
  }
  const wording = () => forgetDestinationWording(titleText(props.destination.title))
  return (
    <li class="flex flex-col gap-1 rounded-md bg-surface-1 px-3 py-3">
      <div class="flex flex-wrap items-center justify-end gap-2">
        <span class="min-w-0 flex-1 truncate text-sm text-text-primary">{titleText(props.destination.title)}</span>
        <Button size="small" variant="outline" onClick={() => setForgetting(true)}>
          {FORGET_DESTINATION}
        </Button>
      </div>
      <Show when={props.destination.removed || sending() > 0}>
        <p class="text-xs" classList={{ "text-negative": props.destination.removed, "text-text-muted": !props.destination.removed }}>
          {props.destination.removed ? DESTINATION_REMOVED : SENDING_COUNT(sending())}
        </p>
      </Show>
      <ConfirmDialog open={forgetting()} title={wording().question} confirm={wording().confirm} decline={wording().decline} onConfirmed={() => void forget()} onDeclined={() => setForgetting(false)}>
        <p>{wording().body}</p>
      </ConfirmDialog>
    </li>
  )
}

/**
 * Sharing books with other people (PROTOCOL.md §5.8, §7): one's own books,
 * each with whom it is shared — let in, or let send plays to it — and the
 * way to invite or take out; the books one was let into, each with what one
 * may do and the way to leave; the books one sends plays to; and a book, or
 * a book's inbox, joined by the invitation code its owner handed over.
 * Codes are veiled while mumming: each is a person's key to a book.
 */
function Sharing(props: { readonly place: Place; readonly crossing: CrossingServices }): JSX.Element {
  const app = useApp()
  const [changed, setChanged] = createSignal(0)
  const [listed] = createResource(
    () => ({ revision: app.revision(), changed: changed(), linked: app.bookLines.linked() }),
    async (): Promise<Outcome<readonly Listed[]>> => {
      const [books, links] = await Promise.all([app.services.session.books(), props.crossing.books.lines.links()])
      if (!books.ok) return books
      const linked = links.ok ? links.value : []
      return Ok(books.value.map((book) => ({ book, link: linked.find((link) => link.bookId === book.id) })))
    },
  )
  /** The books as last read, kept while they are read again, so that no row is drawn anew as a book is written. */
  const rows = createMemo((): readonly Listed[] => ((found) => (found?.ok === true ? found.value : []))(listed.latest))
  const sameIds = (one: readonly BookId[], other: readonly BookId[]): boolean => one.length === other.length && one.every((id, index) => id === other[index])
  const own = createMemo((): readonly BookId[] => rows().filter((row) => roleIn(row.book, app.services.member) === "owner" && (row.link === undefined || isOwnersLink(row.link))).map((row) => row.book.id), [], { equals: sameIds })
  const letIn = createMemo((): readonly BookId[] => rows().filter((row) => row.link !== undefined && !isOwnersLink(row.link)).map((row) => row.book.id), [], { equals: sameIds })
  const roleOf = (row: Listed): MemberRole | undefined => (row.link === undefined || row.link.access.role === "owner" ? undefined : row.link.access.role)
  const changedHere = (): void => {
    setChanged((count) => count + 1)
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="帳簿の共有" />}>
      <Withheld kind="invitation">
        <div class="max-w-5xl">
          <div class="flex flex-col gap-6 p-4">
            <p class="text-sm text-text-muted">{SHARING_INTRO}</p>
            <Show when={((found) => (found?.ok === false ? found.error : undefined))(listed.latest)} keyed>
              {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
            </Show>
            <section class="flex flex-col gap-2">
              <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">{OWN_BOOKS_TO_SHARE}</h2>
              <ul class="flex flex-col gap-1">
                <For each={own()}>{(bookId) => <Show when={rows().find((row) => row.book.id === bookId)}>{(row) => <OwnBookRow listed={row()} crossing={props.crossing} onChanged={changedHere} />}</Show>}</For>
              </ul>
            </section>
            <Show when={letIn().length > 0}>
              <section class="flex flex-col gap-2">
                <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">{BOOKS_LET_INTO}</h2>
                <ul class="flex flex-col gap-1">
                  <For each={letIn()}>
                    {(bookId) => (
                      <Show when={((row) => (row === undefined ? undefined : ((role) => (role === undefined ? undefined : { row, role }))(roleOf(row))))(rows().find((each) => each.book.id === bookId))}>
                        {(found) => <LetInRow listed={found().row} role={found().role} crossing={props.crossing} onChanged={changedHere} />}
                      </Show>
                    )}
                  </For>
                </ul>
              </section>
            </Show>
            <Show when={app.bookLines.destinations().length > 0}>
              <section class="flex flex-col gap-2">
                <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">{DESTINATIONS_HEADING}</h2>
                <p class="text-xs text-text-muted">{DESTINATIONS_ABOUT}</p>
                <ul class="flex flex-col gap-1">
                  <For each={app.bookLines.destinations()}>{(destination) => <DestinationRow destination={destination} crossing={props.crossing} />}</For>
                </ul>
              </section>
            </Show>
            <section class="flex flex-col gap-2">
              <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">{JOIN_SHARED_HEADING}</h2>
              <JoinByCode crossing={props.crossing} wording={JOIN_SHARED} onJoined={changedHere} />
            </section>
          </div>
        </div>
      </Withheld>
    </MainContent>
  )
}

/** 帳簿の共有, where the build names a relay; where it names none, only that there is none to share by. */
export function SharingSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  return (
    <Show
      when={app.crossing}
      keyed
      fallback={
        <MainContent header={<ViewHeader place={props.place} title="帳簿の共有" />}>
          <p class="p-4 text-sm text-text-muted">{describeBookSyncProblem({ type: "no-relay" })}</p>
        </MainContent>
      }
    >
      {(crossing) => <Sharing place={props.place} crossing={crossing} />}
    </Show>
  )
}
