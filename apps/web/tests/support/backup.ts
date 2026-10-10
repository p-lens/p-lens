import type { ArchiveBytes } from "../../src/backup/port/archiver"
import type { BackupStore, StoredBackup } from "../../src/backup/port/backup-store"
import type { HandedFile, Handover, HandoverFailure } from "../../src/backup/port/handover"
import type { ReceiptStore } from "../../src/backup/port/receipt-store"
import type { Receipt } from "../../src/core/backup/standing"
import type { BookId } from "../../src/core/book/book"
import { Err, Ok } from "../../src/core/result/result"

/** A store held in memory: one archive a key, the newest in place of the one before, stamped by the clock it is given. */
export const memoryBackupStore = (now: () => string): BackupStore => {
  const kept = new Map<string, { readonly listed: StoredBackup; readonly bytes: ArchiveBytes }>()
  return {
    destination: "google-drive",
    warm: () => undefined,
    signIn: async () => Ok(undefined),
    list: async () => Ok([...kept.values()].map((held) => held.listed)),
    put: async (archive) => {
      const listed = { id: `file-of-${archive.key}`, key: archive.key, name: archive.name, savedAt: now() }
      kept.set(archive.key, { listed, bytes: archive.bytes })
      return Ok(listed)
    },
    fetch: async (id) => {
      const held = [...kept.values()].find((each) => each.listed.id === id)
      return held === undefined ? Err({ type: "refused", status: 404, reason: "not found" }) : Ok(held.bytes)
    },
    remove: async (id) => {
      const held = [...kept.values()].find((each) => each.listed.id === id)
      if (held === undefined) return Err({ type: "refused", status: 404, reason: "not found" })
      kept.delete(held.listed.key)
      return Ok(undefined)
    },
  }
}

/** Receipts kept in a map. */
export const memoryReceipts = (): ReceiptStore => {
  const receipts = new Map<BookId, Receipt>()
  return {
    list: async () => Ok([...receipts.values()]),
    remove: async (bookId) => {
      receipts.delete(bookId)
      return Ok(undefined)
    },
    write: async (receipt) => {
      receipts.set(receipt.bookId, receipt)
      return Ok(undefined)
    },
  }
}

/** A handover that keeps what it was given, or fails the way it is told to. */
export const memoryHandover = (failing?: HandoverFailure): Handover & { readonly given: () => readonly HandedFile[] } => {
  const held: { files: readonly HandedFile[] } = { files: [] }
  return {
    given: () => held.files,
    give: async (file) => {
      if (failing !== undefined) return Err(failing)
      held.files = [...held.files, file]
      return Ok(undefined)
    },
  }
}
