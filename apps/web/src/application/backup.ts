import type { ArchiveBytes, Archiver } from "../backup/port/archiver"
import type { BackupStore, StoredBackup } from "../backup/port/backup-store"
import type { Digest } from "../backup/port/digest"
import type { Handover } from "../backup/port/handover"
import type { ReceiptStore, ReceiptStoreError } from "../backup/port/receipt-store"
import { archiveName, archiveOf, backupOf } from "../core/backup/archive"
import { type Destination, fingerprintText, type Receipt, type Standing, standingOf } from "../core/backup/standing"
import type { Book, BookId, Member, TitledBook } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import { BOOK_FILES, type BookFiles } from "../core/journal/layout"
import { titleOfMain } from "../core/journal/title"
import { Err, Ok, type Result, collect, mapErr, mapOk } from "../core/result/result"
import type { BookStorage } from "../storage/port/book-storage"
import type { BookSession } from "./book-session"
import type { BackupProblem, Outcome } from "./errors"
import { fromStorage } from "./lift"

/**
 * Everything backing a book up reaches: the books as the device keeps
 * them, the session a book put back is offered to hledger in, the archive
 * and its fingerprint, the receipts, the handing over of a file, and who
 * and when for what is made here. A store away from the device is handed
 * to the use cases that go to one, since a build may have none.
 */
export interface BackupPorts {
  readonly storage: BookStorage
  readonly session: BookSession
  readonly archiver: Archiver
  readonly digest: Digest
  readonly receipts: ReceiptStore
  readonly handover: Handover
  /** Whoever uses this device, as a book put back here names its owner. */
  readonly me: Member
  readonly now: () => string
  readonly today: () => IsoDate
}

const problem = (found: BackupProblem): Outcome<never> => Err({ type: "backup", problem: found })

const fromBackup = <T>(result: Result<T, BackupProblem>): Outcome<T> => mapErr(result, (found) => ({ type: "backup", problem: found }))

const fromReceipts = <T>(result: Result<T, ReceiptStoreError>): Outcome<T> => mapErr(result, (error) => ({ type: "backup", problem: { type: "receipts", detail: error.detail } }))

const fingerprintOf = async (ports: BackupPorts, files: BookFiles): Promise<Outcome<string>> => fromBackup(await ports.digest(fingerprintText(files)))

/** A book packed to go: its title, its archive, and the fingerprint and moment its receipt will carry. */
interface Packed {
  readonly title: string | undefined
  readonly bytes: ArchiveBytes
  readonly fingerprint: string
  readonly madeAt: string
}

/**
 * A book's files as the device keeps them, packed. They are read from
 * storage and not through hledger: nothing is kept that hledger did not
 * read, and a backup takes them as they are.
 */
const packed = async (ports: BackupPorts, bookId: BookId): Promise<Outcome<Packed>> => {
  const stored = fromStorage(await ports.storage.readBook(bookId))
  if (!stored.ok) return stored
  const fingerprint = await fingerprintOf(ports, stored.value.files)
  if (!fingerprint.ok) return fingerprint
  const madeAt = ports.now()
  const bytes = fromBackup(ports.archiver.pack(archiveOf({ bookId, madeAt, files: stored.value.files })))
  return mapOk(bytes, (archive) => ({ title: titleOfMain(stored.value.files[BOOK_FILES.main] ?? ""), bytes: archive, fingerprint: fingerprint.value, madeAt }))
}

const receipted = async (ports: BackupPorts, receipt: Receipt): Promise<Outcome<Receipt>> => mapOk(fromReceipts(await ports.receipts.write(receipt)), () => receipt)

/** Back a book up to a store away from the device, in place of the backup of it there. Signing in comes first, before the book is packed: the press that asked must still count as one when the store opens its window. */
export const backUpToStore = async (ports: BackupPorts, store: BackupStore, bookId: BookId): Promise<Outcome<Receipt>> => {
  const signedIn = fromBackup(await store.signIn())
  if (!signedIn.ok) return signedIn
  const made = await packed(ports, bookId)
  if (!made.ok) return made
  const put = fromBackup(await store.put({ key: bookId, name: archiveName(made.value.title, bookId, undefined), bytes: made.value.bytes }))
  if (!put.ok) return put
  return receipted(ports, { bookId, destination: store.destination, at: made.value.madeAt, fingerprint: made.value.fingerprint })
}

/**
 * Back a book up to a file the person saves wherever they choose. Handing
 * it over is all that can be known: where it went, or whether it was kept,
 * is theirs.
 */
export const backUpToFile = async (ports: BackupPorts, bookId: BookId): Promise<Outcome<Receipt>> => {
  const made = await packed(ports, bookId)
  if (!made.ok) return made
  const given = fromBackup(await ports.handover.give({ name: archiveName(made.value.title, bookId, ports.today()), type: ports.archiver.mediaType, bytes: made.value.bytes }))
  if (!given.ok) return given
  return receipted(ports, { bookId, destination: "file", at: made.value.madeAt, fingerprint: made.value.fingerprint })
}

/** A book and where it stands against its backups. */
export interface BookStanding {
  readonly book: TitledBook
  readonly standing: Standing
}

const standing = async (ports: BackupPorts, book: Book, receipts: readonly Receipt[]): Promise<Outcome<BookStanding>> => {
  const stored = fromStorage(await ports.storage.readBook(book.id))
  if (!stored.ok) return stored
  const fingerprint = await fingerprintOf(ports, stored.value.files)
  return mapOk(fingerprint, (now) => ({
    book: { ...book, title: titleOfMain(stored.value.files[BOOK_FILES.main] ?? "") },
    standing: standingOf(receipts.find((receipt) => receipt.bookId === book.id), now),
  }))
}

/** Where every book on the device stands against its backups. Nothing leaves the device to say it. */
export const bookStandings = async (ports: BackupPorts): Promise<Outcome<readonly BookStanding[]>> => {
  const books = fromStorage(await ports.storage.listBooks())
  if (!books.ok) return books
  const receipts = fromReceipts(await ports.receipts.list())
  if (!receipts.ok) return receipts
  return collect(await Promise.all(books.value.map((book) => standing(ports, book, receipts.value))))
}

/** A backup a store keeps, and whether its book is on this device already. */
export interface ListedBackup {
  readonly backup: StoredBackup
  readonly here: boolean
}

/** The backups a store keeps, newest first. */
export const storedBackups = async (ports: BackupPorts, store: BackupStore): Promise<Outcome<readonly ListedBackup[]>> => {
  const signedIn = fromBackup(await store.signIn())
  if (!signedIn.ok) return signedIn
  const books = fromStorage(await ports.storage.listBooks())
  if (!books.ok) return books
  const listed = fromBackup(await store.list())
  return mapOk(listed, (backups) =>
    backups.toSorted((left, right) => right.savedAt.localeCompare(left.savedAt)).map((backup) => ({ backup, here: books.value.some((book) => book.id === backup.key) })),
  )
}

/**
 * Put a book back from its archive: only a book the device does not have,
 * and only if hledger reads it. A book already here is left exactly as it
 * is. The book put back has its files and no history, and belongs here to
 * whoever uses this device; its receipt says the backup it came from holds
 * it as it stands.
 */
const restored = async (ports: BackupPorts, bytes: ArchiveBytes, destination: Destination): Promise<Outcome<BookId>> => {
  const archive = fromBackup(ports.archiver.unpack(bytes))
  if (!archive.ok) return archive
  const backup = fromBackup(backupOf(archive.value))
  if (!backup.ok) return backup
  const { bookId, madeAt, files } = backup.value
  const books = fromStorage(await ports.storage.listBooks())
  if (!books.ok) return books
  if (books.value.some((book) => book.id === bookId)) return problem({ type: "book-here", bookId })
  const fingerprint = await fingerprintOf(ports, files)
  if (!fingerprint.ok) return fingerprint
  const adopted = await ports.session.adoptBook({ book: { id: bookId, members: [ports.me] }, files })
  if (!adopted.ok) return adopted
  return mapOk(await receipted(ports, { bookId, destination, at: madeAt, fingerprint: fingerprint.value }), () => bookId)
}

/**
 * Take a backup out of a store, because a person asked for that one to
 * go. A book on this device whose receipt says it is backed up there no
 * longer is, so its receipt goes with the backup: the device must not go
 * on saying a book is kept somewhere it is not.
 */
export const removeStoredBackup = async (ports: BackupPorts, store: BackupStore, backup: StoredBackup): Promise<Outcome<void>> => {
  const removed = fromBackup(await store.remove(backup.id))
  if (!removed.ok) return removed
  const receipts = fromReceipts(await ports.receipts.list())
  if (!receipts.ok) return receipts
  const receipt = receipts.value.find((kept) => kept.bookId === backup.key && kept.destination === store.destination)
  return receipt === undefined ? removed : fromReceipts(await ports.receipts.remove(receipt.bookId))
}

/** Put a book back from a backup a store keeps. */
export const restoreFromStore = async (ports: BackupPorts, store: BackupStore, id: string): Promise<Outcome<BookId>> => {
  const bytes = fromBackup(await store.fetch(id))
  return bytes.ok ? restored(ports, bytes.value, store.destination) : bytes
}

/**
 * Put back each of the backups a person chose from a store, one after
 * another. It stops at the first that cannot be put back and says why;
 * those before it stay put back. How many were.
 */
export const restoreChosenFromStore = async (ports: BackupPorts, store: BackupStore, ids: readonly string[]): Promise<Outcome<number>> =>
  ids.reduce<Promise<Outcome<number>>>(async (running, id) => {
    const so = await running
    if (!so.ok) return so
    return mapOk(await restoreFromStore(ports, store, id), () => so.value + 1)
  }, Promise.resolve(Ok(0)))

/** Put a book back from a backup file the person chose. */
export const restoreFromFile = (ports: BackupPorts, bytes: ArchiveBytes): Promise<Outcome<BookId>> => restored(ports, bytes, "file")
