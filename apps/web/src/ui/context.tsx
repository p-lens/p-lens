import { createContext, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount, useContext, type Accessor, type JSX } from "solid-js"

import { adoptBusinessDayTurn } from "../application/business-day-turn"
import { loadMachineNames, refreshCatalog } from "../application/catalog"
import type { ApplicationError } from "../application/errors"
import type { Services } from "../application/services"
import type { MachineNames } from "../core/catalog/catalog"
import type { Huddle } from "../core/huddle/huddle"
import { listedFor, othersPlays, type HuddlePlay } from "../core/huddle/post"
import { idleMembers } from "../core/huddle/standing"
import { fileEveryBookByYear } from "../application/file-by-year"
import { huddleNow } from "../application/huddle"
import type { CrossingServices } from "../crossing"
import { keepStorage } from "../application/storage-keeping"
import { createMinuteStruck } from "./primitives/minute"
import type { ThemeState } from "./theme/theme"
import { heardOutdated } from "./features/consolidated/outdated"
import { warmConsolidationWhileShown } from "./features/consolidated/warm"
import { savingsShownAfterWrites, type SavingsShown } from "./features/holdings/shown"
import { createHuddleLine, type HuddleLine } from "./features/huddle/huddle-line"
import { createRoomChoices, type RoomChoices } from "./features/huddle/room-choices"
import { createBookLines, type BookLines } from "./features/sync/book-lines"

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
 * app opens, when the device comes back online, when a machine is looked
 * for, and when asked; after something is shared, again a while later, for
 * it to reach this device too.
 */
export interface CatalogDelivery {
  readonly state: Accessor<DeliveryState>
  /** Refreshes now, and says how it went. */
  readonly refresh: () => Promise<DeliveryState>
  /** Refreshes now and a few times over the next minutes, until what was just shared has had time to come back. */
  readonly awaitShared: () => void
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
  /** The others' plays as the line was last read and the list has them (`listedFor`), worked out once for every screen that shows them: none where the device is in no huddle. */
  readonly others: Accessor<readonly HuddlePlay[]>
  /** Every one of the others' plays, those let go of from the list too (`othersPlays`): what the total and the settling up count, since letting a play go from the list takes nothing it spent out of them. */
  readonly counted: Accessor<readonly HuddlePlay[]>
  /** The members who have said nothing for long (`idleMembers`), looked at once a minute while the device is in a huddle. */
  readonly idle: Accessor<ReadonlySet<string>>
}

/** What a book's machines are shown as before the catalog's machines are read: each as the book says it. */
const NO_MACHINE_NAMES: MachineNames = new Map()


/** How long after sharing the catalog is refreshed again, in milliseconds. */
const AFTER_SHARING = [5_000, 30_000, 120_000] as const

interface AppContext {
  readonly services: Services
  /** What crosses devices, where the build names a relay: none plays alone, and the app does everything else without it. */
  readonly crossing: CrossingServices | undefined
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
  /** Counts the writes to books and the catalog alone, from this page or from a book's line: what keeps a book on its line puts each one there. */
  readonly written: Accessor<number>
  /** A book, or the catalog, was written: everything is read again. */
  readonly wrote: () => void
  /**
   * A play in progress was written, and nothing else: the day's plays are
   * read again, and nothing that is of the books — nothing put on a line,
   * nothing asked of hledger ahead — since a reading typed in, or a small role tapped,
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
  /** Counts the times the device came back online: what was read from a server, and failed, is read again after it. */
  readonly reconnected: Accessor<number>
  readonly backups: BackupsMade
  readonly huddle: HuddleJoined
  /** The lines the device's books are on, as the page has them; none open where the build names no relay. */
  readonly bookLines: BookLines
}

const Context = createContext<AppContext>()

export function AppProvider(props: {
  readonly services: Services
  readonly crossing: CrossingServices | undefined
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
  const bookLines = createBookLines()
  const huddle = (): Huddle | undefined => {
    huddleChanges()
    return huddleNow(props.services.preferences, props.services.businessDay())
  }
  const minute = createMinuteStruck()
  /** The moment the others are known up to: now while the line is heard, and the last time it was while it is not — so their silence is never blamed for this device's. */
  const heardUpTo = (): number => ((heard) => (heard.type === "unreached" && heard.since !== undefined ? Math.min(minute(), Date.parse(heard.since)) : minute()))(huddleLine.heard())
  const huddleIdle = createMemo((): ReadonlySet<string> => (huddle() === undefined ? new Set() : idleMembers(huddleLine.entries(), heardUpTo())))
  const huddleCounted = createMemo((): readonly HuddlePlay[] => ((joined) => (joined === undefined ? [] : othersPlays(huddleLine.entries(), joined.member)))(huddle()))
  const huddleOthers = createMemo((): readonly HuddlePlay[] => ((joined) => (joined === undefined ? [] : listedFor(huddleCounted(), joined)))(huddle()))
  const [state, setState] = createSignal<DeliveryState>({ type: "idle" })
  const timers: { pending: readonly ReturnType<typeof setTimeout>[] } = { pending: [] }
  const refresh = async (): Promise<DeliveryState> => {
    setState({ type: "refreshing" })
    const done = await refreshCatalog(props.services.catalog)
    const ended: DeliveryState = done.ok ? { type: "idle" } : { type: "failed", error: done.error }
    setState(ended)
    if (done.ok && done.value) wrote()
    return ended
  }
  const refreshInBackground = (): void => {
    void refresh()
  }
  const awaitShared = (): void => {
    timers.pending.forEach(clearTimeout)
    timers.pending = AFTER_SHARING.map((delay) => setTimeout(refreshInBackground, delay))
    refreshInBackground()
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
  /** A book, or the catalog, written: everything read again, and the browser asked to keep what is stored. */
  const wroteAndKept = (): void => {
    wrote()
    keepWhatWasWritten()
  }
  const [reconnected, setReconnected] = createSignal(0)
  const backOnline = (): void => {
    setReconnected((count) => count + 1)
    refreshInBackground()
  }
  /** Every book filed by year once a page, as the app opens: the device's own work, waiting on nothing that crosses devices. */
  const fileByYearOnce = (): void => {
    void fileEveryBookByYear({ session: props.services.session, member: props.services.member }).then((years) => {
      if (years.ok && years.value > 0) wroteAndKept()
    })
  }
  onMount(() => {
    refreshInBackground()
    fileByYearOnce()
    window.addEventListener("online", backOnline)
  })
  onCleanup(() => {
    timers.pending.forEach(clearTimeout)
    window.removeEventListener("online", backOnline)
  })
  return (
    <Context.Provider value={{
        services: props.services,
        get crossing() {
          return props.crossing
        },
        theme: props.theme,
        updates: props.updates,
        revision,
        consolidationOutdated,
        savingsShown,
        written,
        wrote: wroteAndKept,
        played,
        delivery: { state, refresh, awaitShared },
        machineNames,
        reconnected,
        backups: { count: backupsMade, made: backupMade },
        huddle: { now: huddle, changed: () => setHuddleChanges((count) => count + 1), line: huddleLine, chosen: roomChoices, others: huddleOthers, counted: huddleCounted, idle: huddleIdle },
        bookLines,
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
