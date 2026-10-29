import { createContext, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount, useContext, type Accessor, type JSX, type Setter } from "solid-js"

import { adoptBusinessDayTurn } from "../application/business-day-turn"
import { loadMachineNames, refreshCatalog } from "../application/catalog"
import type { ApplicationError, Outcome } from "../application/errors"
import { Err } from "../core/result/result"
import type { Services } from "../application/services"
import type { BookId } from "../core/book/book"
import type { MachineNames } from "../core/catalog/catalog"
import type { Huddle } from "../core/huddle/huddle"
import { listedFor, othersPlays, type HuddlePlay } from "../core/huddle/post"
import { idleMembers } from "../core/huddle/standing"
import { fileEveryBookByYear } from "../application/file-by-year"
import { huddleNow } from "../application/huddle"
import { continueHere } from "../application/play-line"
import type { PlayId } from "../core/play/play"
import { receiveArrivals, type Arrivals } from "../application/inbox"
import { restoreGrantsOf } from "../application/invitations"
import { keepStorage } from "../application/storage-keeping"
import { distinctFailures, laggingOf, retryingAfter, retryWait, syncAll, type Retrying, type RoundStarted, type SyncedAll, type SyncFailure, type Synced } from "../application/sync"
import { createMinuteStruck } from "./primitives/minute"
import { NOT_YET, type Reach } from "./primitives/reach"
import { onShownAgain } from "./primitives/shown-again"
import { toast } from "./primitives/toast"
import type { ThemeState } from "./theme/theme"
import { unreadableArrivalsText } from "./wording/sync"
import { CONTINUED_HERE, continueFailedText } from "./wording/play-line"
import { heardOutdated } from "./features/consolidated/outdated"
import { warmConsolidationWhileShown } from "./features/consolidated/warm"
import { savingsShownAfterWrites, type SavingsShown } from "./features/holdings/shown"
import { createHuddleLine, type HuddleLine } from "./features/huddle/huddle-line"
import { createRoomChoices, type RoomChoices } from "./features/huddle/room-choices"
import { createSendingNow, type SendingNow } from "./features/live/sending-now"

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

/** Where syncing this device's books stands: nothing under way, a round running, or how the last one went — every book that stopped, where any did, one or more. */
export type SyncState =
  | { readonly type: "idle" }
  | { readonly type: "syncing" }
  | { readonly type: "synced"; readonly synced: Synced; readonly at: string }
  | { readonly type: "failed"; readonly failures: readonly SyncFailure[]; readonly synced: Synced; readonly at: string }

/** The books of a failed round that a later round may get past by itself: what keeps the device out of date, as against a book waiting on a person. */
export const lagging = (state: SyncState): readonly SyncFailure[] => (state.type === "failed" ? laggingOf(state.failures) : [])

/**
 * The syncing of this device's books with their other devices, and the
 * plays sent to them. A round runs when the app opens, a little after each
 * write, when the device comes back online or the app is shown again, while
 * the last round failed for something a round may get past — a minute
 * after, then longer for each round more that failed the same way — and when
 * asked; asked, it says how the round it ran went.
 */
export interface BookSync {
  readonly state: Accessor<SyncState>
  readonly run: () => Promise<SyncState>
  /** When every book a round could take through last came through, on this page: what a failed round is out of date since. A book waiting on a person — a conflict to choose in, a book let go of — is told of on its own and holds back none of the others. */
  readonly lastSynced: Accessor<string | undefined>
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

/**
 * The plays the owner's other devices hold, as the screens meet them: the
 * one a screen has open, whose line is read more often while it is — a
 * device set up to stream a play shows it as it goes — and the way to
 * continue one on this device.
 */
export interface PlayLineWatch {
  readonly watching: Accessor<PlayId | undefined>
  readonly watch: (playId: PlayId | undefined) => void
  /** How reading the lines of the plays the other devices hold stands: what is shown of those plays says, while it fails, as of when it is. */
  readonly heard: Accessor<Reach>
  readonly setHeard: Setter<Reach>
  /** Claims the play for this device and says how that went: once it is here, every screen reads it again as this device's own. Whether it came over, was taken off its book meanwhile — no play to stay on — or could not be brought over now. */
  readonly continueHere: (playId: PlayId) => Promise<Continuing>
}

/** What came of continuing a play here: it came over, it was gone from its book, or it could not be brought over now. */
export type Continuing = "continued" | "gone" | "refused"

/** What a book's machines are shown as before the catalog's machines are read: each as the book says it. */
const NO_MACHINE_NAMES: MachineNames = new Map()

/** How long after a write its sync waits, so several writes in a row go as one round, in milliseconds. */
const AFTER_WRITING = 3_000

/** How soon a round is tried again after one failed for something a round may get past, while the page is shown, in milliseconds — longer for each round the wait started that failed the same way (`retryWait`): a weak signal or a hall's login page never tells the browser it went offline, so no `online` comes to say it is back. */
const RETRY_EVERY = 60_000

/** How long after a round ended the page shown again runs another, in milliseconds: a phone tells of a return several ways at once. */
const SHOWN_AGAIN_AFTER = 30_000

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
  /** Counts the times the device came back online: what was read from a server, and failed, is read again after it. */
  readonly reconnected: Accessor<number>
  readonly backups: BackupsMade
  readonly huddle: HuddleJoined
  readonly playLine: PlayLineWatch
  /** The plays being sent to a book's owner, one standing for the page: a play pressed to go from one list is still on its way in every other. */
  readonly sending: SendingNow
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
  const sendingNow = createSendingNow(props.services, played)
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
  /** The moment the others are known up to: now while the line is heard, and the last time it was while it is not — so their silence is never blamed for this device's. */
  const heardUpTo = (): number => ((heard) => (heard.type === "unreached" && heard.since !== undefined ? Math.min(minute(), Date.parse(heard.since)) : minute()))(huddleLine.heard())
  const huddleIdle = createMemo((): ReadonlySet<string> => (huddle() === undefined ? new Set() : idleMembers(huddleLine.entries(), heardUpTo())))
  const huddleCounted = createMemo((): readonly HuddlePlay[] => ((joined) => (joined === undefined ? [] : othersPlays(huddleLine.entries(), joined.member)))(huddle()))
  const huddleOthers = createMemo((): readonly HuddlePlay[] => ((joined) => (joined === undefined ? [] : listedFor(huddleCounted(), joined)))(huddle()))
  const [watching, setWatching] = createSignal<PlayId | undefined>(undefined)
  const [linesHeard, setLinesHeard] = createSignal<Reach>(NOT_YET)
  const continuedHere = async (playId: PlayId): Promise<Continuing> => {
    const continued = await continueHere(props.services.playLine, playId).catch((): Outcome<never> => Err({ type: "sync", problem: { type: "stalled" } }))
    played()
    toast(continued.ok ? { title: CONTINUED_HERE, stays: "glance" } : { title: continueFailedText(continued.error), tone: "error" })
    if (continued.ok) return "continued"
    return continued.error.type === "play-gone" ? "gone" : "refused"
  }
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
  const [syncState, setSyncState] = createSignal<SyncState>({ type: "idle" })
  const [lastSynced, setLastSynced] = createSignal<string | undefined>(undefined)
  const syncing: {
    running: boolean
    again: boolean
    waiting: ReturnType<typeof setTimeout> | undefined
    waiters: readonly ((state: SyncState) => void)[]
    endedAt: number
    retrying: Retrying | undefined
    started: RoundStarted
    retry: ReturnType<typeof setTimeout> | undefined
    grantsRestored: ReadonlySet<BookId>
    filed: boolean
  } = { running: false, again: false, waiting: undefined, waiters: [], endedAt: 0, retrying: undefined, started: "otherwise", retry: undefined, grantsRestored: new Set(), filed: false }
  /** Plays that arrived: the day's plays read again where any was taken in, and a word where any could not be read. */
  const told = (arrived: Arrivals): void => {
    if (arrived.taken > 0) setRevision((count) => count + 1)
    if (arrived.unreadable > 0) toast({ title: unreadableArrivalsText(arrived.unreadable) })
  }
  const restoreGrantsUntilDone = (through: readonly BookId[]): void => {
    const due = through.filter((bookId) => !syncing.grantsRestored.has(bookId))
    if (due.length === 0) return
    syncing.grantsRestored = new Set([...syncing.grantsRestored, ...due])
    void restoreGrantsOf({ links: props.services.sync.links, relay: props.services.sync.relay, sealer: props.services.sync.sealer, invitations: props.services.invitations, now: props.services.now, newId: () => crypto.randomUUID() }, due).then((missed) => {
      syncing.grantsRestored = new Set([...syncing.grantsRestored].filter((bookId) => !missed.includes(bookId)))
    })
  }
  const fileByYearOnce = (): void => {
    if (syncing.filed) return
    syncing.filed = true
    void fileEveryBookByYear({ session: props.services.session, history: props.services.sync.history, links: props.services.sync.links, member: props.services.member }).then((years) => {
      if (years.ok && years.value > 0) wroteAndSync()
    })
  }
  /** A round over every book, then every inbox: whatever stopped either is the round's to say, and a round broken off on the device itself is said as one. */
  const roundOver = async (): Promise<SyncedAll> => {
    const books = await syncAll(props.services.sync)
    if (books.synced.received > 0) wrote()
    restoreGrantsUntilDone(books.through)
    const inboxes = await receiveArrivals({ links: props.services.sync.links, relay: props.services.sync.relay, sealer: props.services.sync.sealer, invitations: props.services.invitations, drafts: props.services.drafts, follow: props.services.playLine.follow })
    told(inboxes.arrivals)
    return { synced: books.synced, through: books.through, failures: distinctFailures([...books.failures, ...inboxes.failures]) }
  }
  const stalled: SyncedAll = { synced: { received: 0, sent: 0 }, through: [], failures: [{ bookId: undefined, error: { type: "sync", problem: { type: "stalled" } } }] }
  const startRound = (started: RoundStarted): Promise<SyncState> => {
    const ended = new Promise<SyncState>((settle) => {
      syncing.waiters = [...syncing.waiters, settle]
    })
    if (syncing.running) {
      syncing.again = true
      return ended
    }
    syncing.running = true
    syncing.started = started
    clearTimeout(syncing.retry)
    setSyncState({ type: "syncing" })
    void roundOver()
      .catch(() => stalled)
      .then((done) => {
        syncing.running = false
        syncing.endedAt = Date.now()
        const at = props.services.now()
        const state: SyncState = done.failures.length === 0 ? { type: "synced", synced: done.synced, at } : { type: "failed", failures: done.failures, synced: done.synced, at }
        setSyncState(state)
        syncing.retrying = retryingAfter(syncing.retrying, done.failures, syncing.started)
        if (syncing.retrying === undefined) setLastSynced(at)
        else syncing.retry = setTimeout(retryWhileLagging, retryWait(syncing.retrying, RETRY_EVERY))
        fileByYearOnce()
        if (syncing.again) {
          syncing.again = false
          void startRound("otherwise")
          return
        }
        const waiting = syncing.waiters
        syncing.waiters = []
        waiting.forEach((settle) => settle(state))
      })
    return ended
  }
  const runSync = (): Promise<SyncState> => startRound("otherwise")
  const runInBackground = (): void => {
    void runSync()
  }
  const runShownAgain = (): void => {
    if (!syncing.running && Date.now() - syncing.endedAt > SHOWN_AGAIN_AFTER) runInBackground()
  }
  /** A round again once the wait after a failed one is out, while the page is shown; one hidden then is left to the page being shown again. */
  const retryWhileLagging = (): void => {
    const retrying = syncing.retrying
    if (retrying === undefined || syncing.running || document.visibilityState !== "visible") return
    if (Date.now() - syncing.endedAt >= retryWait(retrying, RETRY_EVERY)) void startRound("by-retry")
  }
  const shownAgain = (): void => {
    runShownAgain()
    retryWhileLagging()
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
    syncing.waiting = setTimeout(runInBackground, AFTER_WRITING)
  }
  const [reconnected, setReconnected] = createSignal(0)
  const backOnline = (): void => {
    setReconnected((count) => count + 1)
    runInBackground()
    refreshInBackground()
  }
  onMount(() => {
    refreshInBackground()
    runInBackground()
    window.addEventListener("online", backOnline)
    const stopListening = onShownAgain(shownAgain)
    onCleanup(stopListening)
  })
  onCleanup(() => {
    timers.pending.forEach(clearTimeout)
    clearTimeout(syncing.waiting)
    clearTimeout(syncing.retry)
    window.removeEventListener("online", backOnline)
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
        sync: { state: syncState, run: runSync, lastSynced },
        reconnected,
        backups: { count: backupsMade, made: backupMade },
        huddle: { now: huddle, changed: () => setHuddleChanges((count) => count + 1), line: huddleLine, chosen: roomChoices, others: huddleOthers, counted: huddleCounted, idle: huddleIdle },
        sending: sendingNow,
        playLine: { watching, watch: (playId) => setWatching(playId), heard: linesHeard, setHeard: setLinesHeard, continueHere: continuedHere },
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
