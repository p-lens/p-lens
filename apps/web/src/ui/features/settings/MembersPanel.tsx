import { createResource, createSignal, For, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { invitationsOf, invite, uninvite, type InvitationPorts } from "../../../application/invitations"
import type { BookId } from "../../../core/book/book"
import type { InvitedRole } from "../../../core/sync/invitation"
import type { KeptInvitation } from "../../../sync/port/invitation-store"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { copyText } from "../../primitives/clipboard"
import { ConfirmDialog } from "../../primitives/dialog"
import { createNudge } from "../../primitives/nudge"
import { Loaded } from "../../primitives/states"
import { settleTyping, TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { describeError } from "../../wording/errors"
import { invitationMessage, roleText } from "../../wording/sync"

const isRole = (value: string | null): value is InvitedRole => value === "viewer" || value === "editor" || value === "sender"

/** What a person is sent, put on the clipboard as a message ready to paste: how to join, and their code. */
const sendOff = async (app: string, title: string, invitation: KeptInvitation): Promise<void> => {
  const copied = await copyText(invitationMessage(app, title, invitation.role, invitation.code))
  toast(copied.ok ? { title: "招待の文面をコピーしました", description: `${invitation.name}さんに、そのまま貼って送ってください。` } : { title: "コピーできませんでした", tone: "error" })
}

/** The code alone, put on the clipboard: for whoever was sent the message already and needs only this. */
const copyCode = async (invitation: KeptInvitation): Promise<void> => {
  const copied = await copyText(invitation.code)
  toast(copied.ok ? { title: "招待コードをコピーしました", description: `${invitation.name}さんのコードです。` } : { title: "コピーできませんでした", tone: "error" })
}

/**
 * One person let into the book in a line: their name, what they may do,
 * and at the line's end the small buttons that copy their code again and
 * take them back out — the second only after being asked again.
 */
function Member(props: { readonly invitation: KeptInvitation; readonly onRemove: () => void }): JSX.Element {
  return (
    <li class="flex items-center gap-2 py-1">
      <span class="min-w-0 flex-1 break-words text-sm text-text-primary">{props.invitation.name}</span>
      <span class="shrink-0 text-xs text-text-muted">{roleText(props.invitation.role)}</span>
      <Button variant="outline" size="small" class="shrink-0" onClick={() => void copyCode(props.invitation)}>
        コード
      </Button>
      <Button variant="outline" size="small" class="shrink-0" onClick={() => props.onRemove()}>
        外す
      </Button>
    </li>
  )
}

/**
 * Whom the owner has let into a book, and the way to let in one more: a
 * name for the owner's own memory, whether they may write, only read, or
 * only send plays in, and a code made for that person alone — copied, as it is made, inside a
 * message that says how to join, ready to paste to them. The relay knows each by a token
 * and never by name; the names are this device's. Taken back out, a
 * person's code opens the book no longer — what they already took stays
 * with them.
 */
export function MembersPanel(props: { readonly bookId: BookId; readonly title: string }): JSX.Element {
  const app = useApp()
  const ports = (): InvitationPorts => ({
    links: app.services.sync.links,
    relay: app.services.sync.relay,
    sealer: app.services.sync.sealer,
    invitations: app.services.invitations,
    now: app.services.now,
    newId: () => crypto.randomUUID(),
  })
  const [changed, setChanged] = createSignal(0)
  const [members] = createResource(
    () => ({ bookId: props.bookId, changed: changed() }),
    (source) => invitationsOf(ports(), source.bookId),
  )
  const [name, setName] = createSignal("")
  const [role, setRole] = createSignal<InvitedRole>("viewer")
  const [working, setWorking] = createSignal(false)
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  /** The person the owner asked to take out, until they say yes or no. */
  const [removing, setRemoving] = createSignal<KeptInvitation | undefined>(undefined)
  const nudge = createNudge()
  const add = async (): Promise<void> => {
    settleTyping()
    if (working()) return
    if (name().trim() === "") {
      nudge.nudge()
      return
    }
    setWorking(true)
    const made = await invite(ports(), props.bookId, props.title, name(), role())
    setWorking(false)
    setFailure(made.ok ? undefined : made.error)
    if (!made.ok) return
    setName("")
    setChanged((count) => count + 1)
    await sendOff(app.services.name, props.title, made.value)
  }
  const remove = async (invitation: KeptInvitation): Promise<void> => {
    setRemoving(undefined)
    const gone = await uninvite(ports(), invitation)
    setFailure(gone.ok ? undefined : gone.error)
    if (!gone.ok) return
    toast({ title: `${invitation.name}さんを外しました` })
    setChanged((count) => count + 1)
  }
  return (
    <div class="flex flex-col gap-3 rounded-md border border-border p-3">
      <Loaded outcome={members()}>
        {(found) => (
          <Show when={found.length > 0} fallback={<p class="text-xs text-text-muted">まだだれも招待していません。</p>}>
            <ul class="flex flex-col divide-y divide-border">
              <For each={found}>{(each) => <Member invitation={each} onRemove={() => setRemoving(each)} />}</For>
            </ul>
          </Show>
        )}
      </Loaded>
      <form
        autocomplete="off"
        class="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <div class="flex flex-wrap items-end gap-2">
          <div class="min-w-0 flex-1 sm:max-w-xs">
            <TextField label="招待する人の名前" value={name()} onChange={setName} invalid={nudge.red() && name().trim() === ""} onFocus={nudge.settle} maxLength={30} />
          </div>
          <ToggleGroup
            value={role()}
            onChange={(value: string | null) => {
              if (isRole(value)) setRole(value)
            }}
            aria-label="権限"
          >
            <ToggleGroupItem value="viewer">{roleText("viewer")}</ToggleGroupItem>
            <ToggleGroupItem value="editor">{roleText("editor")}</ToggleGroupItem>
            <ToggleGroupItem value="sender">{roleText("sender")}</ToggleGroupItem>
          </ToggleGroup>
          <Button type="submit" size="small" class="shrink-0">
            {working() ? "作成中…" : "招待コードを作る"}
          </Button>
        </div>
        <p class="text-xs text-text-muted">閲覧は見るだけ、編集は記録もできます。稼働の受信は、帳簿を見せずにその人の稼働を受け取ります。作ると、手順つきの文面がコピーされます。</p>
      </form>
      <Show when={failure()} keyed>
        {(error) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </p>
        )}
      </Show>
      <ConfirmDialog
        open={removing() !== undefined}
        title="この人を帳簿から外しますか？"
        confirm="外す"
        decline="やめる"
        onConfirmed={() => {
          const invitation = removing()
          if (invitation !== undefined) void remove(invitation)
        }}
        onDeclined={() => setRemoving(undefined)}
      >
        <p>{removing()?.name ?? ""}</p>
        <p>この人のコードでは、これ以降の変更を受け取れなくなります。すでに受け取った分は相手の端末に残ります。</p>
      </ConfirmDialog>
    </div>
  )
}
