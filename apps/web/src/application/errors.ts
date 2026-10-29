import type { Capability } from "../core/access/role"
import type { ArchiveFailure } from "../backup/port/archiver"
import type { StoreFailure } from "../backup/port/backup-store"
import type { DigestFailure } from "../backup/port/digest"
import type { HandoverFailure } from "../backup/port/handover"
import type { ArchiveProblem } from "../core/backup/archive"
import type { BookId } from "../core/book/book"
import type { PlayId } from "../core/play/play"
import type { PrecordProblem } from "../core/import/precord"
import type { NameProblem } from "../core/names/known"
import type { CashRaised } from "../core/report/cash-raised"
import type { OpeningProblem } from "../core/parlor/opening"
import type { TallyError } from "../core/tally/tally"
import type { ForfeitureProblem } from "../core/savings/forfeiture"
import type { PrizeExchangeProblem } from "../core/savings/prize-exchange"
import type { RateChangeError } from "../core/savings/rate-change"
import type { ReportError } from "../core/report/figures"
import type { CodecProblem } from "../core/sync/codec"
import type { PairingProblem } from "../core/sync/pairing"
import type { RebaseProblem } from "../core/sync/rebase"
import type { Result } from "../core/result/result"
import type { Trouble } from "../hledger/protocol/wire"
import type { HistoryError } from "../history/port/history-port"
import type { StorageError } from "../storage/port/book-storage"
import type { DraftError } from "../storage/port/draft-storage"
import type { RelayFailure } from "../sync/port/relay"
import type { SealFailure } from "../sync/port/sealer"
import type { CatalogError } from "../catalog/port/catalog"
import type { SettingsUnreadable } from "../core/book/settings"
import type { UnreadableFile } from "../core/book/unreadable-files"
import type { TallyProblem } from "../core/report/tally-problems"
import type { DirectoryError } from "../parlors/port/parlor-directory"
import type { ProofError } from "../core/grounds/proof"
import type { ReasonerFailure } from "../reasoning/protocol/messages"
import type * as PachinkoEngine from "../pachinko-engine/protocol/messages"
import type * as PachislotEngine from "../pachislot-engine/protocol/messages"
import type * as Pachislot from "../core/pachislot"

/**
 * Everything a use case can fail with, each case carrying the failure it came
 * from. The screen decides what to say; nothing here is a sentence.
 */
/**
 * Why a book could not be synced, or joined.
 *
 * - `not-linked`: the book is not synced from this device.
 * - `no-relay`: this build names no relay to start syncing through.
 * - `nothing-to-join`: the pairing code's line has no commits yet.
 * - `book-here`: the book the code is for is already on this device.
 * - `unsettled`: the line kept moving while this device tried to catch up.
 * - `stalled`: a round broke off on the device itself, its storage closed under it as a phone sets an app aside; opening the app again mends it.
 */
export type SyncProblem =
  | RelayFailure
  | SealFailure
  | RebaseProblem
  | CodecProblem
  | PairingProblem
  | { readonly type: "links"; readonly detail: string }
  | { readonly type: "links-unreadable" }
  | { readonly type: "not-linked" }
  | { readonly type: "no-relay" }
  | { readonly type: "nothing-to-join" }
  | { readonly type: "book-here"; readonly bookId: BookId }
  | { readonly type: "unsettled" }
  | { readonly type: "not-a-huddle-code" }
  | { readonly type: "stalled" }

/**
 * Why a book could not be backed up, or put back.
 *
 * - `book-here`: the book the backup is of is already on this device.
 * - `file-unopened`: the file a person picked could not be read at all.
 */
export type BackupProblem =
  | ArchiveFailure
  | ArchiveProblem
  | StoreFailure
  | HandoverFailure
  | DigestFailure
  | { readonly type: "receipts"; readonly detail: string }
  | { readonly type: "book-here"; readonly bookId: BookId }
  | { readonly type: "file-unopened" }

/**
 * Why a file of another app's tallies was not taken in.
 *
 * - `nothing-new`: the book already has every tally the file holds.
 */
export type ImportProblem = PrecordProblem | { readonly type: "nothing-new"; readonly count: number } | { readonly type: "not-utf8" }

export type ApplicationError =
  | { readonly type: "storage"; readonly error: StorageError }
  | { readonly type: "draft"; readonly error: DraftError }
  | { readonly type: "hledger"; readonly trouble: Trouble }
  | { readonly type: "journal-rejected"; readonly trouble: Trouble }
  | { readonly type: "unknown-names"; readonly problems: readonly NameProblem[] }
  | { readonly type: "tally-problems"; readonly problems: readonly TallyProblem[] }
  | { readonly type: "file-unreadable"; readonly file: UnreadableFile }
  | { readonly type: "cash-raised"; readonly raised: readonly CashRaised[] }
  | { readonly type: "report"; readonly error: ReportError }
  | { readonly type: "tally"; readonly error: TallyError }
  | { readonly type: "parlor"; readonly error: OpeningProblem }
  | { readonly type: "history"; readonly error: HistoryError }
  | { readonly type: "sync"; readonly problem: SyncProblem }
  | { readonly type: "backup"; readonly problem: BackupProblem }
  | { readonly type: "handover"; readonly failure: HandoverFailure }
  | { readonly type: "archive"; readonly failure: ArchiveFailure }
  | { readonly type: "forbidden"; readonly capability: Capability }
  | { readonly type: "prize-exchange"; readonly problem: PrizeExchangeProblem }
  | { readonly type: "forfeiture"; readonly problem: ForfeitureProblem }
  | { readonly type: "rate-change"; readonly problem: RateChangeError }
  | { readonly type: "import"; readonly problem: ImportProblem }
  | { readonly type: "tally-missing" }
  /** A play's tally written into its book, and the play then not marked recorded on the device: the book has it, and it is not to be recorded again. */
  | { readonly type: "recorded-unmarked"; readonly error: DraftError }
  | { readonly type: "tally-unreadable" }
  /** A play another of the owner's devices held, taken off its book since this device's copy of it was shown: deleted, or now recorded into another book. */
  | { readonly type: "play-gone"; readonly playId: PlayId; readonly reason: "withdrawn" | "moved" }
  /** A year's entries not moved into its file, since hledger would read the book otherwise after it. */
  | { readonly type: "filing-differs"; readonly year: string }
  | SettingsUnreadable
  | { readonly type: "opening-balance-registered"; readonly parlor: string; readonly tier: string }
  | { readonly type: "catalog"; readonly error: CatalogError }
  | { readonly type: "directory"; readonly error: DirectoryError }
  | { readonly type: "submissions"; readonly detail: string }
  | { readonly type: "pachinko-engine"; readonly failure: PachinkoEngine.EngineFailure }
  | { readonly type: "reasoner"; readonly failure: ReasonerFailure }
  | { readonly type: "proof"; readonly error: ProofError }
  | { readonly type: "pachislot-engine"; readonly failure: PachislotEngine.EngineFailure }
  | { readonly type: "pachislot-play"; readonly problem: Pachislot.ObservationProblem | Pachislot.PriorProblem }

export type Outcome<T> = Result<T, ApplicationError>
