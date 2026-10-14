import { ACTIVITY_LOG, unreadableActivityLines } from "../activity/activity"
import { FAVORITES_LOG, unreadableFavoriteLines } from "../favorites/favorites"
import type { BookFiles } from "../journal/layout"
import { MARKS_LOG, unreadableMarkLines } from "../marks/marks"
import { parsePlayLog } from "../play-log/checkpoint"
import { termsInHead } from "../play-log/head"
import { BOOK_SETTINGS_FILE, bookSettingsOf } from "./settings"

/** A file of a book that does not read: the whole of it, or the lines of it named, by number. */
export interface UnreadableFile {
  readonly path: string
  readonly lines: readonly number[] | undefined
}

const PLAY_LOG = /^(pachinko|pachislot)-play\/[^/]+\.jsonl$/

const linesUnread = (path: string, lines: readonly number[]): readonly UnreadableFile[] => (lines.length === 0 ? [] : [{ path, lines }])

const playLogUnread = (path: string, text: string): readonly UnreadableFile[] => {
  if (termsInHead(text).type === "unreadable") return [{ path, lines: [1] }]
  const read = parsePlayLog(text)
  if (read.ok) return []
  return [{ path, lines: read.error.type === "non-monotonic" ? undefined : [read.error.line] }]
}

/**
 * The files of a book this app keeps beside its journal that do not read,
 * where reading them passes over what does not read, or takes it as none:
 * so that a book whose files were broken, by hand or on the way, says so
 * where its books are listed, and is put right in the file itself.
 */
export const unreadableFilesOf = (files: BookFiles): readonly UnreadableFile[] => [
  ...(bookSettingsOf(files[BOOK_SETTINGS_FILE]).ok ? [] : [{ path: BOOK_SETTINGS_FILE, lines: undefined }]),
  ...linesUnread(FAVORITES_LOG, unreadableFavoriteLines(files)),
  ...linesUnread(MARKS_LOG, unreadableMarkLines(files)),
  ...linesUnread(ACTIVITY_LOG, unreadableActivityLines(files[ACTIVITY_LOG] ?? "")),
  ...Object.entries(files)
    .filter(([path]) => PLAY_LOG.test(path))
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([path, text]) => playLogUnread(path, text)),
]
