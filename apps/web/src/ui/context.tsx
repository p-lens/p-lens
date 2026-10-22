import { createContext, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount, useContext, type Accessor, type JSX } from "solid-js"

import { adoptBusinessDayTurn } from "../application/business-day-turn"
import { loadMachineNames, refreshCatalog } from "../application/catalog"
import type { ApplicationError } from "../application/errors"
import type { Services } from "../application/services"
import type { MachineNames } from "../core/catalog/catalog"
import type { Huddle } from "../core/huddle/huddle"
import { othersPlaysFor, type HuddlePlay } from "../core/huddle/post"
import { idleMembers } from "../core/huddle/standing"
import { fileEveryBookByYear } from "../application/file-by-year"
import { huddleNow } from "../application/huddle"
import { receiveArrivals, type Arrivals } from "../application/inbox"
import { restoreEveryGrant } from "../application/invitations"
import { keepStorage } from "../application/storage-keeping"
import { syncAll, type Synced } from "../application/sync"
import { createMinuteStruck } from "./primitives/minute"
import { toast } from "./primitives/toast"
import type { ThemeState } from "./theme/theme"
import { unreadableArrivalsText } from "./wording/sync"
import { heardOutdated } from "./features/consolidated/outdated"
import { warmConsolidationWhileShown } from "./features/consolidated/warm"
import { savingsShownAfterWrites, type SavingsShown } from "./features/holdings/shown"
import { createHuddleLine, type HuddleLine } from "./features/huddle/huddle-line"
import { createRoomChoices, type RoomChoices } from "./features/huddle/room-choices"

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

/**
 * The huddle this device is in on the business day it is, read again
 * whenever a screen joins or leaves one: the rail's ノリ打ち and the plays
 * it shows and is shown read the same.
 */
export interface HuddleJoined {
  readonly now: Accessor<Huddle | undefined>
  readonly changed: () => void
  /** What the page has read of its line, and when it last showed a play there. */
  readonly line: HuddleLine
  /** Whose plays its room lists and adds up. */
  readonly chosen: RoomChoices
  /** The others' plays as the line was last read (`othersPlaysFor`), worked out once for every screen that shows them: none where the device is in no huddle. */
  readonly others: Accessor<readonly HuddlePlay[]>
  /** The members who have said nothing for long (`idleMembers`), looked at once a minute while the device is in a huddle. */
  readonly idle: Accessor<ReadonlySet<string>>
}

/** What a book's machines are shown as before the catalog's machines are read: each as the book says it. */
const NO_MACHINE_NAMES: MachineNames = new Map()

/** How long after a write its sync waits, so several writes in a row go as one round, in milliseconds. */
const AFTER_WRITING = 3_000

/** How long after sharing the catalog is refreshed again, in milliseconds. */
const AFTER_SHARING = [5_000, 30_000, 120_000] as const

export interface AppContext {
  readonly services: Services
  readonly theme: ThemeState
  readonly updates: UpdateState
  /**
   * Counts writes made from this page, to a book or to a play in progress.
   * Views read it so that what they asked of hledger, or of the day's
   * plays, is asked again after it changes.
   */
  readonly revision: Accessor<number>
  /**
   * Counts the times the consolidation found an answer it showed to be of a
   * book written since, a while after the last of them: its views read it
   * so that they ask again and show the books as they stand.
   */
  readonly consolidationOutdated: Accessor<number>
  /** What 貯玉・貯メダル last showed, shown at once when it is opened again while it asks anew, and asked again a while after each write. */
  readonly savingsShown: SavingsShown
  /** A book, or the catalog, was written: everything is read again, and the books are synced a while after. */
  readonly wrote: () => void
  /**
   * A play in progress was written, and nothing else: the day's plays are
   * read again, and nothing that is of the books — no sync, nothing asked
   * of hledger ahead — since a reading typed in, or a small role tapped,
   * changes none of them, and doing it all after each ran a phone down.
   */
  readonly played: () => void
  readonly delivery: CatalogDelivery
  /**
   * The catalog's machines by the name a book keeps each under, read again
   * after every write and every delivery: what a screen says a book's
   * machine with (`shownNameOf`), the halls' name and not the model name.
   */
  readonly machineNames: Accessor<MachineNames>
  readonly sync: BookSync
  readonly backups: BackupsMade
  readonly huddle: HuddleJoined
}

const Context = createContext<AppContext>()

export function AppProvider(props: {
  readonly services: Services
  readonly theme: ThemeState
  readonly updates: UpdateState
  readonly children: JSX.Element
}): JSX.Element {
  const [revision, setRevision] = createSignal(0)
  /** Counts the writes to books and the catalog alone: what is of them is read again, ahead or behind, after these and not after a play's. */
  const [written, setWritten] = createSignal(0)
  const played = (): void => {
    setRevision((count) => count + 1)
  }
  const wrote = (): void => {
    setWritten((count) => count + 1)
    played()
  }
  createEffect(on(written, () => void adoptBusinessDayTurn(props.services.session, props.services.preferences)))
  warmConsolidationWhileShown(props.services, written)
  const consolidationOutdated = heardOutdated(props.services)
  const savingsShown = savingsShownAfterWrites(written)
  const [machinesRead] = createResource(
    () => ({ written: written() }),
    () => loadMachineNames(props.services.catalog),
  )
  const machineNames = (): MachineNames => machinesRead.latest ?? NO_MACHINE_NAMES
  const [huddleChanges, setHuddleChanges] = createSignal(0)
  const huddleLine = createHuddleLine()
  const roomChoices = createRoomChoices()
  const huddle = (): Huddle | undefined => {
    huddleChanges()
    return huddleNow(props.services.preferences, props.services.businessDay())
  }
  const minute = createMinuteStruck()
  const huddleIdle = createMemo((): ReadonlySet<string> => (huddle() === undefined ? new Set() : idleMembers(huddleLine.entries(), minute())))
  const huddleOthers = createMemo((): readonly HuddlePlay[] => ((joined) => (joined === undefined ? [] : othersPlaysFor(huddleLine.entries(), joined)))(huddle()))
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
  const syncing: { running: boolean; again: boolean; waiting: ReturnType<typeof setTimeout> | undefined; grantsRestored: boolean; filed: boolean } = { running: false, again: false, waiting: undefined, grantsRestored: false, filed: false }
  /** Plays that arrived: the day's plays read again where any was taken in, and a word where any could not be read. */
  const told = (arrived: Arrivals): void => {
    if (arrived.taken > 0) setRevision((count) => count + 1)
    if (arrived.unreadable > 0) toast({ title: unreadableArrivalsText(arrived.unreadable) })
  }
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
      if (done.ok && done.value.received > 0) wrote()
      if (done.ok) void receiveArrivals({ links: props.services.sync.links, relay: props.services.sync.relay, sealer: props.services.sync.sealer, invitations: props.services.invitations, drafts: props.services.drafts }).then(told)
      if (done.ok && !syncing.grantsRestored) {
        syncing.grantsRestored = true
        void restoreEveryGrant({ links: props.services.sync.links, relay: props.services.sync.relay, sealer: props.services.sync.sealer, invitations: props.services.invitations, now: props.services.now, newId: () => crypto.randomUUID() })
      }
      if (!syncing.filed) {
        syncing.filed = true
        void fileEveryBookByYear({ session: props.services.session, history: props.services.sync.history, links: props.services.sync.links, member: props.services.member }).then((years) => {
          if (years.ok && years.value > 0) wroteAndSync()
        })
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
  const keeping: { asked: boolean } = { asked: false }
  /** Has the browser asked to keep the storage, once a page and at a write: a browser that puts the question to the person puts it as they save something, not as the app opens. */
  const keepWhatWasWritten = (): void => {
    if (keeping.asked) return
    keeping.asked = true
    void keepStorage(props.services.storageKeeper)
  }
  const wroteAndSync = (): void => {
    wrote()
    keepWhatWasWritten()
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
        consolidationOutdated,
        savingsShown,
        wrote: wroteAndSync,
        played,
        delivery: { state, refresh, awaitShared },
        machineNames,
        sync: { state: syncState, run: runSync },
        backups: { count: backupsMade, made: backupMade },
        huddle: { now: huddle, changed: () => setHuddleChanges((count) => count + 1), line: huddleLine, chosen: roomChoices, others: huddleOthers, idle: huddleIdle },
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
