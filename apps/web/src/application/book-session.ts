import { ACTIVITY_LOG, activityLineOf, activityLinesOf, withActivity, type ActivityLine } from "../core/activity/activity"
import type { Capability } from "../core/access/role"
import { memberCan, roleIn, type Book, type BookId, type ListedBook, type MemberId } from "../core/book/book"
import { inOrder } from "../core/book/order"
import { BOOK_SETTINGS_FILE, bookSettingsOf } from "../core/book/settings"
import { fileChangesBetween, patchesOf, type ChangeIntent, type FileChange, type JournalChange } from "../core/change/journal-change"
import { BOOK_FILES, ENTRY_FILE, type BookFiles } from "../core/journal/layout"
import { titleOfMain } from "../core/journal/title"
import { Err, Ok, collect, mapOk } from "../core/result/result"
import type { HledgerClient, JournalAccess } from "../hledger/client/client"
import type { CommitId, HistoryPort } from "../history/port/history-port"
import type { BookStorage, StoredBook } from "../storage/port/book-storage"
import type { Outcome } from "./errors"
import { fromHistory, fromHledger, fromStorage } from "./lift"

export interface SessionPorts {
  readonly hledger: HledgerClient
  readonly storage: BookStorage
  readonly history: HistoryPort
  readonly clock: () => Date
  /** An id nothing else has, for a line of a book's activity. */
  readonly newId: () => string
  readonly member: MemberId
}

/** Who is making a change, when and why. */
type Begun = Pick<JournalChange, "at" | "author" | "intent">

/** What a change wants written, and why, before anything is written. */
export interface ProposedChange {
  readonly files: BookFiles
  readonly intent: ChangeIntent
  /**
   * What the journal, as proposed, must also be for the change to be kept:
   * asked of hledger once it has read the proposed files, before anything
   * is stored. A change that fails it is refused like one hledger refused.
   */
  readonly accept?: (journal: JournalAccess) => Promise<Outcome<void>>
}

/**
 * A book's files as worked out from elsewhere — commits taken from its line
 * folded in — and how history is told what they now hold, once they are kept.
 */
export interface Folded {
  readonly files: BookFiles
  readonly settle: () => Promise<Outcome<void>>
}

/**
 * A book open in hledger, and the way every use case reaches it.
 *
 * hledger holds one journal; this remembers which files it was given, and
 * gives it a book's files again only when they differ from what it holds —
 * another tab may have written since. Each piece of work runs in one hledger
 * turn, so a write's trial, its keeping and the reports asked after it never
 * interleave with anything else.
 */
export interface BookSession {
  /** Every book on the device as it is listed, in the order books stand in everywhere: this member's own as they placed them, then the rest as they came. */
  readonly books: () => Promise<Outcome<readonly ListedBook[]>>
  readonly createBook: (stored: StoredBook) => Promise<Outcome<CommitId>>
  readonly read: <T>(bookId: BookId, work: (journal: JournalAccess, stored: StoredBook) => Promise<Outcome<T>>) => Promise<Outcome<T>>
  readonly write: (
    bookId: BookId,
    propose: (journal: JournalAccess, stored: StoredBook) => Promise<Outcome<ProposedChange>>,
  ) => Promise<Outcome<CommitId>>
  /**
   * Replace a book's files with ones worked out from them, trialled in
   * hledger first like any write, and making no commit of its own: the
   * commits are the ones folded in, which `settle` records. Nothing to fold
   * leaves the book as it is. It runs in the book's turn, so no write lands
   * between reading the files and keeping the new ones. Whoever may read a
   * book may have it brought up to its line: what is folded in is others'
   * work arriving, not this member's writing.
   */
  readonly fold: (bookId: BookId, work: (stored: StoredBook) => Promise<Outcome<Folded | undefined>>) => Promise<Outcome<void>>
  /** Put a book taken whole from its line on the device, if hledger reads it; its commits are kept by whoever took them. */
  readonly adoptBook: (stored: StoredBook) => Promise<Outcome<void>>
}

const sameFiles = (left: BookFiles, right: BookFiles): boolean =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(([path, text]) => right[path] === text)

/** Whether a change gives a book another title than it has, however the change was made: by its name's own field, or by a hand in its main journal. */
const retitles = (before: BookFiles, after: BookFiles): boolean => titleOfMain(before[BOOK_FILES.main] ?? "") !== titleOfMain(after[BOOK_FILES.main] ?? "")

const requiring = (book: Book, member: MemberId, capability: Capability): Outcome<Book> =>
  memberCan(book, member, capability) ? Ok(book) : Err({ type: "forbidden", capability })

export const createBookSession = (ports: SessionPorts): BookSession => {
  const held: { files: BookFiles | undefined } = { files: undefined }

  const hold = async (journal: JournalAccess, files: BookFiles): Promise<Outcome<void>> => {
    if (held.files !== undefined && sameFiles(held.files, files)) return Ok(undefined)
    held.files = undefined
    const opened = fromHledger(await journal.open(files, ENTRY_FILE))
    if (opened.ok) held.files = files
    return mapOk(opened, () => undefined)
  }

  const openBook = async (journal: JournalAccess, bookId: BookId): Promise<Outcome<StoredBook>> => {
    const stored = fromStorage(await ports.storage.readBook(bookId))
    if (!stored.ok) return stored
    const holding = await hold(journal, stored.value.files)
    return holding.ok ? Ok(stored.value) : holding
  }

  /** A cover with the title its main journal gives and what its settings give — its place, and the hour a business day turns over at — read from storage: the book's files are where it is named and placed. Its settings are read only for this member's own books. */
  const listed = async (book: Book): Promise<Outcome<ListedBook>> =>
    mapOk(fromStorage(await ports.storage.readBook(book.id)), (stored) =>
      ((settings) => ({
        ...book,
        title: titleOfMain(stored.files[BOOK_FILES.main] ?? ""),
        order: settings?.ok === true ? settings.value.order : undefined,
        businessDayTurn: settings?.ok === true ? settings.value.businessDayTurn : undefined,
      }))(roleIn(book, ports.member) === "owner" ? bookSettingsOf(stored.files[BOOK_SETTINGS_FILE]) : undefined),
    )

  /** A change being made now by this device's member: who, when and why, before what it does to any file is known. */
  const beginning = (intent: ChangeIntent): Begun => ({ at: ports.clock().toISOString(), author: ports.member, intent })

  const changeOf = (bookId: BookId, begun: Begun, files: readonly FileChange[]): JournalChange => ({ bookId, ...begun, files: patchesOf(files) })

  /**
   * What a book's history says was done to it, oldest first: what its
   * activity log is given to begin with, for a book written before it kept
   * one, each line under its commit's id: the same on every device the
   * history reached, so the same line wherever it is put in. Not asked for
   * a book that already keeps a log.
   */
  const historyBefore = async (bookId: BookId, files: BookFiles): Promise<Outcome<readonly ActivityLine[]>> =>
    files[ACTIVITY_LOG] === undefined
      ? mapOk(fromHistory(await ports.history.log(bookId)), (commits) => activityLinesOf(commits).toReversed())
      : Ok([])

  /**
   * Offer the proposed files to hledger, and keep them only if it reads them
   * and storage takes them. Either refusal puts the old journal back. What
   * is kept is the proposed files with the change written in the book's
   * activity, so the commit carries both and neither is ever without the other.
   */
  const keep = async (journal: JournalAccess, bookId: BookId, stored: StoredBook, proposed: ProposedChange): Promise<Outcome<CommitId>> => {
    const trial = await journal.open(proposed.files, ENTRY_FILE)
    held.files = undefined
    if (!trial.ok) {
      await hold(journal, stored.files)
      return Err({ type: "journal-rejected", trouble: trial.error })
    }
    const accepted = proposed.accept === undefined ? Ok(undefined) : await proposed.accept(journal)
    if (!accepted.ok) {
      await hold(journal, stored.files)
      return accepted
    }
    const before = await historyBefore(bookId, proposed.files)
    if (!before.ok) {
      await hold(journal, stored.files)
      return before
    }
    const begun = beginning(proposed.intent)
    const told = patchesOf(fileChangesBetween(stored.files, proposed.files))
    const kept = withActivity(proposed.files, before.value, activityLineOf(ports.newId(), { ...begun, files: told }))
    held.files = kept
    const changes = fileChangesBetween(stored.files, kept)
    const written = fromStorage(await ports.storage.applyChanges(bookId, changes))
    if (!written.ok) {
      await hold(journal, stored.files)
      return written
    }
    return fromHistory(await ports.history.commit(changeOf(bookId, begun, changes)))
  }

  return {
    books: async () => {
      const covers = fromStorage(await ports.storage.listBooks())
      if (!covers.ok) return covers
      return mapOk(collect(await Promise.all(covers.value.map(listed))), inOrder)
    },

    createBook: async (stored) => {
      const begun = beginning({ type: "book-created" })
      const told = patchesOf(fileChangesBetween({}, stored.files))
      const files = withActivity(stored.files, [], activityLineOf(ports.newId(), { ...begun, files: told }))
      const created = fromStorage(await ports.storage.createBook({ ...stored, files }))
      if (!created.ok) return created
      return fromHistory(await ports.history.commit(changeOf(stored.book.id, begun, fileChangesBetween({}, files))))
    },

    read: (bookId, work) =>
      ports.hledger.inTurn(async (journal) => {
        const stored = await openBook(journal, bookId)
        return stored.ok ? work(journal, stored.value) : stored
      }),

    fold: (bookId, work) =>
      ports.hledger.inTurn(async (journal) => {
        const stored = await openBook(journal, bookId)
        if (!stored.ok) return stored
        const allowed = requiring(stored.value.book, ports.member, "read")
        if (!allowed.ok) return allowed
        const folded = await work(stored.value)
        if (!folded.ok || folded.value === undefined) return mapOk(folded, () => undefined)
        const trial = await journal.open(folded.value.files, ENTRY_FILE)
        held.files = undefined
        if (!trial.ok) {
          await hold(journal, stored.value.files)
          return Err({ type: "journal-rejected", trouble: trial.error })
        }
        held.files = folded.value.files
        const written = fromStorage(await ports.storage.applyChanges(bookId, fileChangesBetween(stored.value.files, folded.value.files)))
        if (!written.ok) {
          await hold(journal, stored.value.files)
          return written
        }
        return folded.value.settle()
      }),

    adoptBook: (stored) =>
      ports.hledger.inTurn(async (journal) => {
        const trial = await journal.open(stored.files, ENTRY_FILE)
        held.files = undefined
        if (!trial.ok) return Err({ type: "journal-rejected", trouble: trial.error })
        return fromStorage(await ports.storage.createBook(stored))
      }),

    write: (bookId, propose) =>
      ports.hledger.inTurn(async (journal) => {
        const stored = await openBook(journal, bookId)
        if (!stored.ok) return stored
        const allowed = requiring(stored.value.book, ports.member, "write")
        if (!allowed.ok) return allowed
        const proposed = await propose(journal, stored.value)
        if (!proposed.ok) return proposed
        const named = retitles(stored.value.files, proposed.value.files) ? requiring(stored.value.book, ports.member, "rename") : Ok(stored.value.book)
        return named.ok ? keep(journal, bookId, stored.value, proposed.value) : named
      }),
  }
}
