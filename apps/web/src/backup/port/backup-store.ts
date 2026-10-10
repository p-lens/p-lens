import type { Destination } from "../../core/backup/standing"
import type { Result } from "../../core/result/result"
import type { ArchiveBytes } from "./archiver"

/** A backup as a store lists it: the store's own id for it, the key it was put under, its name there, and when it was last put. */
export interface StoredBackup {
  readonly id: string
  readonly key: string
  readonly name: string
  /** ISO 8601. */
  readonly savedAt: string
}

/**
 * Why a store gave nothing.
 *
 * - `sign-in-unavailable`: the store's sign-in could not be reached at all.
 * - `sign-in-blocked`: the browser kept the sign-in window from opening; a second press opens it.
 * - `sign-in-declined`: the person closed the sign-in, or said no.
 * - `refused`: the store answered, and said no.
 */
export type StoreFailure =
  | { readonly type: "sign-in-unavailable"; readonly detail: string }
  | { readonly type: "sign-in-blocked" }
  | { readonly type: "sign-in-declined"; readonly reason: string }
  | { readonly type: "unreachable"; readonly detail: string }
  | { readonly type: "refused"; readonly status: number; readonly reason: string }

/**
 * Somewhere away from the device that keeps backups: one archive a key,
 * the newest put under a key taking the place of the one before. It is only
 * ever reached because a person pressed something — an adapter asks them to
 * sign in when it needs to, and nothing reaches it on its own.
 */
export interface BackupStore {
  /** Which destination this store is, as a receipt names it. */
  readonly destination: Exclude<Destination, "file">
  /** Make ready for a press, where the screen that leads to the store is opened: nothing is asked of the store about anyone. */
  readonly warm: () => void
  /**
   * Have the person sign in now. It is called first of all in what a press
   * does, before anything slow, so a store that opens a window to sign in
   * opens it while the press still counts as one. A store already signed in
   * answers at once.
   */
  readonly signIn: () => Promise<Result<void, StoreFailure>>
  readonly list: () => Promise<Result<readonly StoredBackup[], StoreFailure>>
  readonly put: (archive: { readonly key: string; readonly name: string; readonly bytes: ArchiveBytes }) => Promise<Result<StoredBackup, StoreFailure>>
  readonly fetch: (id: string) => Promise<Result<ArchiveBytes, StoreFailure>>
  /** Take a backup out of the store, by the store's id for it. Where the store has somewhere things taken out are kept a while, it goes there. */
  readonly remove: (id: string) => Promise<Result<void, StoreFailure>>
}
