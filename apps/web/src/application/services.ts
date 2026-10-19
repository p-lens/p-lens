import type { BackupStore } from "../backup/port/backup-store"
import type { MemberId } from "../core/book/book"
import type { Documents } from "../core/document/document"
import type { StoredBook } from "../storage/port/book-storage"
import type { DeletionPorts } from "./delete-book"
import type { IsoDate } from "../core/calendar/calendar"
import type { PlayId } from "../core/play/play"
import type { HistoryPort } from "../history/port/history-port"
import type { DraftStorage } from "../storage/port/draft-storage"
import type { StorageKeeper } from "../storage/port/storage-keeping"
import type { DeviceData } from "../storage/port/device-data"
import type { Catalog } from "../catalog/port/catalog"
import type { Locator } from "../location/port/locator"
import type { ParlorDirectory } from "../parlors/port/parlor-directory"
import type { SubmissionStore } from "../parlors/port/submission-store"
import type { ReasonerClient } from "../reasoning/client/client"
import type * as PachinkoEngine from "../pachinko-engine/client/client"
import type * as PachislotEngine from "../pachislot-engine/client/client"
import type { BackupPorts } from "./backup"
import type { BookSession } from "./book-session"
import type { ConsolidationPorts } from "./consolidation"
import type { VoterOf } from "./marks"
import type { ExportPorts } from "./export"
import type { Preferences } from "../preferences/port/preferences"
import type { DestinationStore } from "../sync/port/destination-store"
import type { InvitationStore } from "../sync/port/invitation-store"
import type { SyncPorts } from "./sync"
import type { SampleMaker } from "../sample-book/port/sample-maker"

/**
 * Everything the screens are handed: the session every use case runs in, the
 * history, plays still being played, the shared catalog as delivered and the engines, who
 * is using the device, and the effects a form needs — what day and moment it
 * is, a fresh id, a fresh seed. Which adapters stand behind them is decided once,
 * in `app/composition`.
 */
export interface Services {
  readonly session: BookSession
  /** What a consolidation reaches: the books, and what it keeps of each one's answers. */
  readonly consolidation: ConsolidationPorts
  readonly history: HistoryPort
  readonly drafts: DraftStorage
  /** The shared catalog of both games, as delivered to this device. */
  readonly catalog: Catalog
  /** Whether this build names a shared catalog to take deliveries from; one that names none has nothing to refresh. */
  readonly catalogShared: boolean
  readonly parlors: ParlorDirectory
  readonly submissions: SubmissionStore
  /** Where the device is, asked only when a play is being started at a parlor. */
  readonly locate: Locator
  /** Where a parlor not on the list is submitted; none in a build with no list. */
  readonly surveyUrl: string | undefined
  /** The pachinko engine, started the first time a pachinko formula or play needs it. */
  readonly pachinko: PachinkoEngine.EngineClient
  /** The reasoner a pachinko formula's grounds are proved by, with pachinko's rules, started the first time they are opened. */
  readonly pachinkoReasoner: ReasonerClient
  /** The pachislot engine, started the first time a pachislot formula or play needs it. */
  readonly pachislot: PachislotEngine.EngineClient
  /** The reasoner an AT machine's grounds are proved by, with pachislot's rules, started the first time they are opened. */
  readonly pachislotReasoner: ReasonerClient
  /** Where a sample book's days are played, a worker of their own each time one is made. */
  readonly sampleMaker: SampleMaker
  /** What syncing a book between a person's devices reaches. */
  readonly sync: SyncPorts
  /** Whom this device's owner has let into their books, as the device remembers them. */
  readonly invitations: InvitationStore
  /** The books of other people this device may send plays to. */
  readonly destinations: DestinationStore
  /** The relay a book starts syncing through; none in a build that names none, where a book can still be joined by its code. */
  readonly relayUrl: string | undefined
  /** What backing a book up, and putting one back, reaches. */
  readonly backup: BackupPorts
  /** The store away from the device a book is backed up to; none in a build that names none, where a book is still backed up to a file. */
  readonly backupStore: BackupStore | undefined
  /** What writing a book out as a file — its journals as one, its plays as a table — reaches. */
  readonly export: ExportPorts
  readonly member: MemberId
  /** The documents this deployment puts before people: its terms, its privacy policy, or neither. */
  readonly documents: Documents
  /** What the deployment goes by: the name every screen and sentence that names the app writes. */
  readonly name: string
  /** Who runs the deployment, as a page of theirs where they can be found. */
  readonly operatorPage: string
  /** Where the deployment's product is introduced at length, where it has such a page. */
  readonly landingPage: string | undefined
  /** The version of the app this copy was built from, as its package says it. */
  readonly version: string
  /** The name a member of a book is counted under in the shared catalog. */
  readonly voter: VoterOf
  /** The calendar day it is, where the person is. */
  readonly today: () => IsoDate
  /** The business day it is: the day a play started now belongs to, and "today" wherever plays are counted. It turns over at the hour the person set. */
  readonly businessDay: () => IsoDate
  /** What the person has set for this device. */
  readonly preferences: Preferences
  /** The moment, as an ISO 8601 timestamp. */
  readonly now: () => string
  readonly newPlayId: () => PlayId
  /** A title for a book nobody has named, drawn afresh: a picture none of the titles there begins with, then マイ帳簿. */
  readonly unnamedTitle: (taken: readonly string[]) => string
  /** The book a device with none is given: its owner's own, empty, under an id no other device could make and a title drawn for it. */
  readonly firstBook: () => StoredBook
  /** The browser's word on whether what this device stores is kept. */
  readonly storageKeeper: StorageKeeper
  /** Everything this device keeps for the app, for emptying it. */
  readonly deviceData: DeviceData
  /** Everywhere this device keeps something of a book, for taking one off it. */
  readonly deletion: DeletionPorts
  /**
   * A fresh play id as the id of a play on a day already past: the same id,
   * placed in that day, so a play added by hand afterwards still sorts by
   * the day it was played. The same id and day give the same id.
   */
  readonly playIdOn: (fresh: PlayId, date: IsoDate) => PlayId
  /** A fresh 64-bit simulation seed, as a decimal string. */
  readonly newSeed: () => string
}
