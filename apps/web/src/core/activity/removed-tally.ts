import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { isTransactionsFile } from "../journal/filing"
import type { PlayId } from "../play/play"
import { withoutTallyEntry } from "../tally/in-journal"
import type { ActivityId, ActivityLine } from "./activity"

/** A tally's entry as a line of activity says it was taken out: the play it was of, what it was written under, the day it was dated, and its text. */
export interface RemovedTally {
  readonly playId: PlayId
  readonly description: string
  readonly date: IsoDate
  readonly entry: string
}

const DAY = /^(\d{4}-\d{2}-\d{2})/

/** Lines without the blank ones at either end. */
const trimmed = (lines: readonly string[]): readonly string[] => {
  const start = lines.findIndex((line) => line.trim() !== "")
  const end = lines.findLastIndex((line) => line.trim() !== "")
  return start === -1 ? [] : lines.slice(start, end + 1)
}

/** The day an entry's header opens with; none where it opens with none. */
const dayOf = (entry: string): IsoDate | undefined => {
  const day = DAY.exec(entry)?.[1]
  const read = day === undefined ? undefined : parseIsoDate(day)
  return read?.ok === true ? read.value : undefined
}

/**
 * The tally a line of activity took out of the book, read back from the
 * lines it took away: a removal whose line still holds its changes, which
 * took lines away from one file of transactions and put none in, and whose
 * lines are that play's entry and nothing else. None for any other line,
 * or one whose changes have been pruned.
 */
export const removedTallyOf = (line: ActivityLine): RemovedTally | undefined => {
  const play = line.parts.play
  const patches = line.parts.changes?.files ?? []
  const [patch] = patches
  if (line.did !== "play-removed" || play === undefined || patch === undefined || patches.length !== 1 || !isTransactionsFile(patch.path) || patch.created) return undefined
  if (patch.hunks.some((hunk) => hunk.added.length > 0)) return undefined
  const entry = `${trimmed(patch.hunks.flatMap((hunk) => hunk.removed)).join("\n")}\n`
  const date = dayOf(entry)
  return date === undefined || withoutTallyEntry(entry, play.id)?.trim() !== "" ? undefined : { playId: play.id, description: play.description, date, entry }
}

/**
 * The removals among a book's activity, newest first, that can be taken
 * back: each whose tally can be read back from it, and that no later line
 * speaks of the same play after — a removal taken back, or the play
 * recorded again, leaves nothing to take back.
 */
export const restorableRemovals = (newestFirst: readonly ActivityLine[]): ReadonlySet<ActivityId> =>
  new Set(
    newestFirst.flatMap((line, index) => {
      const removed = removedTallyOf(line)
      const spokenOfSince = removed !== undefined && newestFirst.slice(0, index).some((later) => later.parts.play?.id === removed.playId)
      return removed === undefined || spokenOfSince ? [] : [line.id]
    }),
  )
