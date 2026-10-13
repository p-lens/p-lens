import type { ReceiptStore } from "../backup/port/receipt-store"
import type { BookId } from "../core/book/book"
import { isUntouched } from "../core/book/untouched"
import { Ok, collect, mapErr, mapOk } from "../core/result/result"
import type { HistoryPort } from "../history/port/history-port"
import type { BookStorage, StoredBook } from "../storage/port/book-storage"
import type { DraftStorage } from "../storage/port/draft-storage"
import type { LinkStore } from "../sync/port/link-store"
import type { Outcome } from "./errors"
import { fromDraft, fromHistory, fromStorage } from "./lift"

/** Everywhere a device keeps something of a book: its files, its history, its sync link, its backup's receipt, and the plays still being played for it. */
export interface DeletionPorts {
  readonly storage: BookStorage
  readonly history: HistoryPort
  readonly links: LinkStore
  readonly receipts: ReceiptStore
  readonly drafts: DraftStorage
}

/** The plays still being played for a book let go of: a play with no book to be recorded in is nobody's. */
const withoutDrafts = async (ports: DeletionPorts, bookId: BookId): Promise<Outcome<void>> => {
  const drafts = fromDraft(await ports.drafts.listDrafts())
  if (!drafts.ok) return drafts
  const deleted = await Promise.all(drafts.value.filter((draft) => draft.bookId === bookId).map(async (draft) => fromDraft(await ports.drafts.deleteDraft(draft.id))))
  return mapOk(collect(deleted), () => undefined)
}

/**
 * Take a book off this device, with everything the device kept of it. It
 * is this device's copy that goes: a backup made of it, wherever it was
 * saved, and the book on anyone else's device that syncs it stay as they
 * are, and the book can be put back or joined again from them. Nothing
 * here asks first; whoever calls has.
 *
 * The files go last, so a deletion that stops part way leaves the book
 * there to be deleted again.
 */
export const deleteBook = async (ports: DeletionPorts, bookId: BookId): Promise<Outcome<void>> => {
  const drafts = await withoutDrafts(ports, bookId)
  if (!drafts.ok) return drafts
  const receipt = mapErr(await ports.receipts.remove(bookId), (error) => ({ type: "backup" as const, problem: { type: "receipts" as const, detail: error.detail } }))
  if (!receipt.ok) return receipt
  const link = mapErr(await ports.links.remove(bookId), (error) => ({ type: "sync" as const, problem: { type: "links" as const, detail: error.detail } }))
  if (!link.ok) return link
  const history = fromHistory(await ports.history.forget(bookId))
  if (!history.ok) return history
  const files = fromStorage(await ports.storage.deleteBook(bookId))
  return files.ok ? Ok(undefined) : files
}

/**
 * Whether deleting a book from this device would lose nothing: it holds
 * what a fresh book holds and no more, and no play is being played for
 * it. Such a book is deleted without being asked about twice — a dozen
 * made to try something are a dozen presses to be rid of.
 */
export const holdsNothing = async (ports: Pick<DeletionPorts, "storage" | "drafts">, bookId: BookId, fresh: StoredBook): Promise<Outcome<boolean>> => {
  const stored = fromStorage(await ports.storage.readBook(bookId))
  if (!stored.ok) return stored
  const drafts = fromDraft(await ports.drafts.listDrafts())
  if (!drafts.ok) return drafts
  return Ok(isUntouched(stored.value.files, fresh.files) && !drafts.value.some((draft) => draft.bookId === bookId))
}
