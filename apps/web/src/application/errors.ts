import type { Capability } from "../core/access/role"
import type { ArchiveFailure } from "../backup/port/archiver"
import type { StoreFailure } from "../backup/port/backup-store"
import type { DigestFailure } from "../backup/port/digest"
import type { HandoverFailure } from "../backup/port/handover"
import type { ArchiveProblem } from "../core/backup/archive"
import type { BookId } from "../core/book/book"
import type { RevisionRefusal } from "../core/pachinko/revision"
import type { GeneralProblem } from "../core/import/general"
import type { PachifolioProblem } from "../core/import/pachifolio"
import type { PachiboProblem } from "../core/import/pachibo"
import type { PrecordProblem } from "../core/import/precord"
import type { OpeningProblem } from "../core/parlor/opening"
import type { TallyError } from "../core/tally/tally"
import type { ForfeitureProblem } from "../core/savings/forfeiture"
import type { PrizeExchangeProblem } from "../core/savings/prize-exchange"
import type { RateChangeError } from "../core/savings/rate-change"
import type { ReportError } from "../core/report/figures"
import type { Result } from "../core/result/result"
import type { Trouble } from "../hledger/protocol/wire"
import type { HistoryError } from "../history/port/history-port"
import type { StorageError } from "../storage/port/book-storage"
import type { DraftError } from "../storage/port/draft-storage"
import type { CatalogError } from "../catalog/port/catalog"
import type { SettingsUnreadable } from "../core/book/settings"
import type { DirectoryError } from "../parlors/port/parlor-directory"
import type { ProofError } from "../core/grounds/proof"
import type { ReasonerFailure } from "../reasoning/protocol/messages"
import type * as PachinkoEngine from "../pachinko-engine/protocol/messages"
import type * as PachislotEngine from "../pachislot-engine/protocol/messages"
import type * as Pachislot from "../core/pachislot"

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
export type ImportProblem = GeneralProblem | PrecordProblem | PachifolioProblem | PachiboProblem | { readonly type: "nothing-new"; readonly count: number } | { readonly type: "not-utf8" }

/**
 * Everything a use case can fail with, each case carrying the failure it came
 * from. The screen decides what to say; nothing here is a sentence.
 */
export type ApplicationError =
  | { readonly type: "storage"; readonly error: StorageError }
  | { readonly type: "draft"; readonly error: DraftError }
  | { readonly type: "hledger"; readonly trouble: Trouble }
  | { readonly type: "journal-rejected"; readonly trouble: Trouble }
  | { readonly type: "report"; readonly error: ReportError }
  | { readonly type: "tally"; readonly error: TallyError }
  | { readonly type: "parlor"; readonly error: OpeningProblem }
  | { readonly type: "history"; readonly error: HistoryError }
  | { readonly type: "backup"; readonly problem: BackupProblem }
  | { readonly type: "handover"; readonly failure: HandoverFailure }
  | { readonly type: "archive"; readonly failure: ArchiveFailure }
  | { readonly type: "forbidden"; readonly capability: Capability }
  | { readonly type: "prize-exchange"; readonly problem: PrizeExchangeProblem }
  | { readonly type: "forfeiture"; readonly problem: ForfeitureProblem }
  | { readonly type: "rate-change"; readonly problem: RateChangeError }
  | { readonly type: "import"; readonly problem: ImportProblem }
  | { readonly type: "tally-missing" }
  /** A tally moved into a book that has a tally of its play already. */
  | { readonly type: "tally-in-book" }
  /** A pachinko play's counter said to count a 0R otherwise, which the counter its readings showed does not bear out: the reading at `index` would show less than it must. */
  | { readonly type: "recount-refused"; readonly refusal: RevisionRefusal }
  /** A play's tally written into its book, and the play then not marked recorded on the device: the book has it, and it is not to be recorded again. */
  | { readonly type: "recorded-unmarked"; readonly error: DraftError }
  | { readonly type: "tally-unreadable" }
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
