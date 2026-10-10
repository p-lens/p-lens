import { createResource, createSignal, For, Match, onMount, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { backUpToFile, backUpToStore, bookStandings, type BookStanding, type ListedBackup, removeStoredBackup, restoreChosenFromStore, restoreFromFile, storedBackups } from "../../../application/backup"
import type { ApplicationError, Outcome } from "../../../application/errors"
import type { BackupStore, StoredBackup } from "../../../backup/port/backup-store"
import type { Receipt } from "../../../core/backup/standing"
import type { BookId } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ConfirmDialog } from "../../primitives/dialog"
import { TrashIcon } from "../../primitives/icons"
import { EmptyState, Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import type { Place } from "../../navigation/place"
import { destinationName, lastBackupText, standingText } from "../../wording/backup"
import { bookTitle } from "../../wording/book"
import { formatMoment } from "../../wording/dates"
import { describeError } from "../../wording/errors"
import { ViewHeader } from "../shell/ViewHeader"

/** What a press on this screen is doing, or how the last one failed. */
type Working = { readonly type: "idle" } | { readonly type: "working" } | { readonly type: "failed"; readonly error: ApplicationError }

/** The backups a store keeps, as this screen has them: not asked for yet, on their way, or as the store answered. */
type Listing =
  | { readonly type: "unasked" }
  | { readonly type: "asking" }
  | { readonly type: "answered"; readonly store: BackupStore; readonly backups: Outcome<readonly ListedBackup[]> }

function Failure(props: { readonly error: ApplicationError }): JSX.Element {
  return (
    <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
      {describeError(props.error)}
    </p>
  )
}

function WorkingNote(props: { readonly working: Working; readonly busy: string }): JSX.Element {
  return (
    <Switch>
      <Match when={props.working.type === "working"}>
        <p class="text-sm text-text-muted" role="status">
          {props.busy}
        </p>
      </Match>
      <Match when={props.working.type === "failed" && props.working} keyed>
        {(failed) => <Failure error={failed.error} />}
      </Match>
    </Switch>
  )
}

/**
 * One book: where it stands against its backups, and the ways to back it up
 * now. Laid out for a phone first — the title, how it stands and its last
 * backup each on a line of their own, then the buttons the row's whole
 * width, one under the other; a wider window sets the buttons beside.
 */
function BookRow(props: { readonly listed: BookStanding; readonly store: BackupStore | undefined }): JSX.Element {
  const app = useApp()
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  const backUp = async (made: Promise<Outcome<Receipt>>): Promise<void> => {
    if (working().type === "working") return
    setWorking({ type: "working" })
    const receipt = await made
    setWorking(receipt.ok ? { type: "idle" } : { type: "failed", error: receipt.error })
    if (!receipt.ok) return
    toast({ title: "バックアップしました", description: `${bookTitle(props.listed.book)}（${destinationName(receipt.value.destination)}）` })
    app.backups.made()
  }
  return (
    <li class="flex flex-col gap-3 rounded-md bg-surface-1 p-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="flex min-w-0 flex-col gap-0.5 sm:flex-1">
          <span class="break-words text-sm font-medium text-text-primary">{bookTitle(props.listed.book)}</span>
          <span class="text-xs text-text-secondary">{standingText(props.listed.standing)}</span>
          <Show when={lastBackupText(props.listed.standing)} keyed>
            {(last) => <span class="text-xs text-text-muted">{last}</span>}
          </Show>
        </div>
        <div class="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
          <Show when={props.store} keyed>
            {(store) => (
              <Button variant="secondary" onClick={() => void backUp(backUpToStore(app.services.backup, store, props.listed.book.id))}>
                {destinationName(store.destination)}に保存
              </Button>
            )}
          </Show>
          <Button variant="secondary" onClick={() => void backUp(backUpToFile(app.services.backup, props.listed.book.id))}>
            iCloudドライブなど zipで書き出す
          </Button>
        </div>
      </div>
      <WorkingNote working={working()} busy="バックアップしています…" />
    </li>
  )
}

/**
 * What stands where a row's tick would, for a backup of a book already on
 * the device: a tick drawn, not a control — there is nothing to tick or
 * untick, and a row reads like the others beside it.
 */
function HereMark(): JSX.Element {
  return (
    <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-surface-3 text-text-muted" aria-hidden="true">
      <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}

/** Putting books back: those ticked among a store's backups, together, or one from a file — only ever a book the device does not have, so a backup of one that is here has no tick to give. A backup a store keeps can also be taken out of it, once the person has been asked. */
function Restore(props: { readonly store: BackupStore | undefined }): JSX.Element {
  const app = useApp()
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const [listing, setListing] = createSignal<Listing>({ type: "unasked" })
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  /** The store's backups ticked to be put back, by the store's id for each: every one that can be, as the list is read, for the person to untick what they do not want. */
  const [chosen, setChosen] = createSignal<readonly string[]>([])
  const list = async (store: BackupStore): Promise<void> => {
    if (listing().type === "asking") return
    setListing({ type: "asking" })
    const backups = await storedBackups(app.services.backup, store)
    setChosen(backups.ok ? backups.value.filter((each) => !each.here).map((each) => each.backup.id) : [])
    setListing({ type: "answered", store, backups })
  }
  const restore = async (restoring: () => Promise<Outcome<BookId>>): Promise<void> => {
    if (working().type === "working") return
    setWorking({ type: "working" })
    const restored = await restoring()
    setWorking(restored.ok ? { type: "idle" } : { type: "failed", error: restored.error })
    if (!restored.ok) return
    toast({ title: "帳簿を戻しました" })
    app.wrote()
  }
  const choose = (id: string, on: boolean): void => {
    setChosen((current) => (on ? [...current.filter((each) => each !== id), id] : current.filter((each) => each !== id)))
  }
  /** Puts back what is ticked, one after another; nothing ticked is said, not done. What was put back before one failed stays, and the list is read again either way. */
  const restoreChosen = async (store: BackupStore): Promise<void> => {
    if (working().type === "working") return
    const ids = chosen()
    if (ids.length === 0) {
      toast({ title: "戻す帳簿を選んでください", description: "戻したいバックアップにチェックを付けます。" })
      return
    }
    setWorking({ type: "working" })
    const restored = await restoreChosenFromStore(app.services.backup, store, ids)
    setWorking(restored.ok ? { type: "idle" } : { type: "failed", error: restored.error })
    if (restored.ok) toast({ title: `${String(restored.value)}冊の帳簿を戻しました` })
    app.wrote()
    void list(store)
  }
  /** The backup a person pressed to have taken out of the store, held while they are asked whether they mean it. */
  const [removing, setRemoving] = createSignal<{ readonly store: BackupStore; readonly backup: StoredBackup } | undefined>(undefined)
  const remove = async (asked: { readonly store: BackupStore; readonly backup: StoredBackup }): Promise<void> => {
    setRemoving(undefined)
    if (working().type === "working") return
    setWorking({ type: "working" })
    const removed = await removeStoredBackup(app.services.backup, asked.store, asked.backup)
    setWorking(removed.ok ? { type: "idle" } : { type: "failed", error: removed.error })
    if (!removed.ok) return
    toast({ title: "バックアップを削除しました", description: `${asked.backup.name}（${destinationName(asked.store.destination)}）` })
    app.backups.made()
    void list(asked.store)
  }
  const picked = (input: HTMLInputElement): void => {
    const file = input.files?.[0]
    input.value = ""
    if (file !== undefined) void restore(async () => restoreFromFile(app.services.backup, new Uint8Array(await file.arrayBuffer())))
  }
  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-2 sm:flex-row">
        <Show when={props.store} keyed>
          {(store) => (
            <Button variant="secondary" onClick={() => void list(store)}>
              {destinationName(store.destination)}のバックアップを見る
            </Button>
          )}
        </Show>
        <Button variant="secondary" onClick={() => picker.input?.click()}>
          iCloudドライブなど zipから復元
        </Button>
        <input ref={(element) => (picker.input = element)} type="file" accept=".zip,application/zip" class="hidden" onChange={(event) => picked(event.currentTarget)} />
      </div>
      <WorkingNote working={working()} busy="処理しています…" />
      <ConfirmDialog
        open={removing() !== undefined}
        title="バックアップを削除しますか？"
        confirm="削除する"
        decline="やめる"
        onConfirmed={() => {
          const asked = removing()
          if (asked !== undefined) void remove(asked)
        }}
        onDeclined={() => setRemoving(undefined)}
      >
        <Show when={removing()} keyed>
          {(asked) => (
            <>
              <p>
                {destinationName(asked.store.destination)}の「{asked.backup.name}」（{formatMoment(asked.backup.savedAt)}）をゴミ箱に移します。
              </p>
              <p>この端末の帳簿は消えませんが、この帳簿は「バックアップされていません」に戻ります。</p>
            </>
          )}
        </Show>
      </ConfirmDialog>
      <Switch>
        <Match when={listing().type === "asking"}>
          <p class="text-sm text-text-muted" role="status">
            バックアップを探しています…
          </p>
        </Match>
        <Match when={((state) => (state.type === "answered" ? state : undefined))(listing())} keyed>
          {(answered) => (
            <Loaded outcome={answered.backups}>
              {(backups) => (
                <Show when={backups.length > 0} fallback={<EmptyState title="バックアップが見つかりません" />}>
                  <div class="flex flex-col gap-2">
                    <ul class="flex flex-col gap-1">
                      <For each={backups}>
                        {(each) => (
                          <li class="flex items-start gap-3 rounded-md bg-surface-1 p-3">
                            <Show when={!each.here} fallback={<HereMark />}>
                              <input
                                type="checkbox"
                                aria-label={`${each.backup.name} を戻す`}
                                checked={chosen().includes(each.backup.id)}
                                onChange={(event) => choose(each.backup.id, event.currentTarget.checked)}
                                class="mt-0.5 size-5 shrink-0 accent-accent"
                              />
                            </Show>
                            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span class="break-words text-sm font-medium text-text-primary">{each.backup.name}</span>
                              <span class="text-xs text-text-muted">
                                {formatMoment(each.backup.savedAt)}
                                {each.here ? "・この端末にあります" : ""}
                              </span>
                            </div>
                            <button
                              type="button"
                              aria-label={`${each.backup.name} を${destinationName(answered.store.destination)}から削除`}
                              class="flex size-9 shrink-0 items-center justify-center rounded border border-border text-text-secondary hover:border-negative hover:text-negative [&_svg]:size-4"
                              onClick={() => setRemoving({ store: answered.store, backup: each.backup })}
                            >
                              <TrashIcon />
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show
                      when={backups.some((each) => !each.here)}
                      fallback={<p class="text-xs text-text-muted">どれもこの端末にある帳簿のバックアップです。戻すには、先に「帳簿の管理」でこの端末の帳簿を削除してください。</p>}
                    >
                      <Button variant="secondary" class="w-full sm:w-auto sm:self-start" onClick={() => void restoreChosen(answered.store)}>
                        選んだ帳簿をこの端末に戻す
                      </Button>
                    </Show>
                  </div>
                </Show>
              )}
            </Loaded>
          )}
        </Match>
      </Switch>
    </div>
  )
}

/**
 * Backing a person's books up, and putting one back: each book with where
 * it stands, backed up only when its button is pressed — to Google Drive
 * where the build names it, or to a file saved wherever they choose, iCloud
 * Drive among them. Nothing is sent on its own; opening the screen only
 * makes the store ready for a press — its sign-in script fetched, nothing
 * asked about anyone — so the press itself can open the sign-in window,
 * which a phone's browser allows at no other moment. What goes is the book's
 * hledger files as they are, in a zip, readable by whoever holds it.
 */
export function BackupSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [listed] = createResource(
    () => ({ revision: app.revision(), made: app.backups.count() }),
    () => bookStandings(app.services.backup),
  )
  onMount(() => app.services.backupStore?.warm())
  return (
    <MainContent header={<ViewHeader place={props.place} title="バックアップ" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <p class="text-sm text-text-muted">
            ボタンを押したときだけ、帳簿を端末の外に写します。自動では送りません。中身は hledger のファイルの zip で、暗号化していません。
          </p>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">帳簿</h2>
            <Loaded outcome={listed()}>
              {(books) => (
                <ul class="flex flex-col gap-1">
                  <For each={books}>{(each) => <BookRow listed={each} store={app.services.backupStore} />}</For>
                </ul>
              )}
            </Loaded>
          </section>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">帳簿を戻す</h2>
            <p class="text-sm text-text-muted">この端末にない帳簿だけ戻します。変更の履歴は戻りません。</p>
            <Restore store={app.services.backupStore} />
          </section>
        </div>
      </div>
    </MainContent>
  )
}
