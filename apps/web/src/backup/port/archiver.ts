import type { ArchiveFiles } from "../../core/backup/archive"
import type { Result } from "../../core/result/result"

/** An archive as it travels and is kept: one file's bytes. */
export type ArchiveBytes = Uint8Array<ArrayBuffer>

export type ArchiveFailure =
  | { readonly type: "archive-unwritable"; readonly detail: string }
  | { readonly type: "archive-unreadable"; readonly detail: string }

/**
 * What turns files into the one file a backup travels as, and back. Which
 * format is an adapter's to decide; it must be one a person opens without
 * this app.
 */
export interface Archiver {
  /** What kind of file an archive is, as a media type. */
  readonly mediaType: string
  readonly pack: (files: ArchiveFiles) => Result<ArchiveBytes, ArchiveFailure>
  readonly unpack: (bytes: ArchiveBytes) => Result<ArchiveFiles, ArchiveFailure>
}
