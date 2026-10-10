import { createContext, createSignal, onCleanup, onMount, useContext, type Accessor, type JSX } from "solid-js"

import { refreshCatalog } from "../application/catalog"
import type { ApplicationError } from "../application/errors"
import type { Services } from "../application/services"
import { receiveArrivals } from "../application/inbox"
import { restoreEveryGrant } from "../application/invitations"
import { syncAll, type Synced } from "../application/sync"
import type { ThemeState } from "./theme/theme"

/** Where the installed app stands against the newest published; supplied by the PWA layer. */
export interface UpdateState {
  readonly status: Accessor<{ readonly type: "current" | "offline-ready" | "update-ready" }>
  readonly apply: () => void
  readonly dismiss: () => void
}

/** Where taking the shared catalog's newest delivery stands: nothing under way, asking, or the last ask failed. */
export type DeliveryState = { readonly type: "idle" } | { readonly type: "refreshing" } | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * The shared catalog's deliveries to this device. It is refreshed when the
 * app opens, when a machine is looked for, and when asked; after something
 * is shared, again a while later, for it to reach this device too.
 */
export interface CatalogDelivery {
  readonly state: Accessor<DeliveryState>
  readonly refresh: () => void
  /** Refreshes now and a few times over the next minutes, until what was just shared has had time to come back. */
  readonly awaitShared: () => void
}

/** Where syncing this device's books stands: nothing under way, a round running, or how the last one went. */
export type SyncState =
  | { readonly type: "idle" }
  | { readonly type: "syncing" }
  | { readonly type: "synced"; readonly synced: Synced }
  | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * The syncing of this device's books with their other devices. A round runs
 * when the app opens, a little after each write, when the device comes back
 * online, and when asked.
 */
export interface BookSync {
  readonly state: Accessor<SyncState>
  readonly run: () => void
}

/**
 * The backups made from this page. Views that say where a book stands
 * against its backups read the count, so they look again after one is made.
 */
export interface BackupsMade {
  readonly count: Accessor<number>
  readonly made: () => void
}

/** How long after a write its sync waits, so several writes in a row go as one round, in milliseconds. */
const AFTER_WRITING = 3_000

/** How long after sharing the catalog is refreshed again, in milliseconds. */
const AFTER_SHARING = [5_000, 30_000, 120_000] as const

export interface AppContext {
  readonly services: Services
  readonly theme: ThemeState
  readonly updates: UpdateState
  /**
   * Counts writes made from this page. Views read it so that what they asked
   * of hledger is asked again after the book changes.
   */
  readonly revision: Accessor<number>
  readonly wrote: () => void
  readonly delivery: CatalogDelivery
  readonly sync: BookSync
  readonly backups: BackupsMade
}

const Context = createContext<AppContext>()

export function AppProvider(props: {
  readonly services: Services
  readonly theme: ThemeState
  readonly updates: UpdateState
  readonly children: JSX.Element
}): JSX.Element {
  const [revision, setRevision] = createSignal(0)
  const wrote = (): void => {
    setRevision((count) => count + 1)
  }
  const [state, setState] = createSignal<DeliveryState>({ type: "idle" })
  const timers: { pending: readonly ReturnType<typeof setTimeout>[] } = { pending: [] }
  const refresh = (): void => {
    setState({ type: "refreshing" })
    void refreshCatalog(props.services.catalog).then((done) => {
      setState(done.ok ? { type: "idle" } : { type: "failed", error: done.error })
      if (done.ok && done.value) wrote()
    })
  }
  const awaitShared = (): void => {
    timers.pending.forEach(clearTimeout)
    timers.pending = AFTER_SHARING.map((delay) => setTimeout(refresh, delay))
    refresh()
  }
  const [syncState, setSyncState] = createSignal<SyncState>({ type: "idle" })
  const syncing: { running: boolean; again: boolean; waiting: ReturnType<typeof setTimeout> | undefined; grantsRestored: boolean } = { running: false, again: false, waiting: undefined, grantsRestored: false }
  const runSync = (): void => {
    if (syncing.running) {
      syncing.again = true
      return
    }
    syncing.running = true
    setSyncState({ type: "syncing" })
    void syncAll(props.services.sync).then((done) => {
      syncing.running = false
      setSyncState(done.ok ? { type: "synced", synced: done.value } : { type: "failed", error: done.error })
      if (done.ok && done.value.received > 0) setRevision((count) => count + 1)
      if (done.ok) void receiveArrivals({ links: props.services.sync.links, relay: props.services.sync.relay, sealer: props.services.sync.sealer, invitations: props.services.invitations, drafts: props.services.drafts }).then((arrived) => (arrived > 0 ? setRevision((count) => count + 1) : undefined))
      if (done.ok && !syncing.grantsRestored) {
        syncing.grantsRestored = true
        void restoreEveryGrant({ links: props.services.sync.links, relay: props.services.sync.relay, sealer: props.services.sync.sealer, invitations: props.services.invitations, now: props.services.now, newId: () => crypto.randomUUID() })
      }
      if (syncing.again) {
        syncing.again = false
        runSync()
      }
    })
  }
  const [backupsMade, setBackupsMade] = createSignal(0)
  const backupMade = (): void => {
    setBackupsMade((count) => count + 1)
  }
  const wroteAndSync = (): void => {
    wrote()
    clearTimeout(syncing.waiting)
    syncing.waiting = setTimeout(runSync, AFTER_WRITING)
  }
  onMount(() => {
    refresh()
    runSync()
    window.addEventListener("online", runSync)
  })
  onCleanup(() => {
    timers.pending.forEach(clearTimeout)
    clearTimeout(syncing.waiting)
    window.removeEventListener("online", runSync)
  })
  return (
    <Context.Provider value={{
        services: props.services,
        theme: props.theme,
        updates: props.updates,
        revision,
        wrote: wroteAndSync,
        delivery: { state, refresh, awaitShared },
        sync: { state: syncState, run: runSync },
        backups: { count: backupsMade, made: backupMade },
      }}>
      {props.children}
    </Context.Provider>
  )
}

/**
 * The services and shared state. Only reachable inside `AppProvider`, which
 * wraps the whole app; asked for outside it is a mistake in this code, and
 * the error says so at once rather than surfacing as a broken screen later.
 */
export const useApp = (): AppContext => {
  const found = useContext(Context)
  if (found === undefined) throw new Error("useApp called outside AppProvider")
  return found
}
