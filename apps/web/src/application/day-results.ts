import type { BookId } from "../core/book/book"
import { withEntriesFiled } from "../core/journal/filing"
import { renderEntry } from "../core/journal/entry"
import type { PlayId } from "../core/play/play"
import { Ok } from "../core/result/result"
import { dayResultEntry, type DayResult } from "../core/tally/day-results"
import type { CommitId } from "../history/port/history-port"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { withAccountsFor } from "./record-tally"

/**
 * Write days' 収支 typed in a month at a time (まとめて入力) into a book,
 * a tally a day, each with an id of its own, as one commit: the days are
 * typed together, and are written together or not at all.
 */
export const recordDayResults = (session: BookSession, bookId: BookId, days: readonly DayResult[], newPlayId: () => PlayId): Promise<Outcome<CommitId>> => {
  const entries = days.map((day) => dayResultEntry(newPlayId(), day))
  return session.write(bookId, async (_journal, stored) =>
    Ok({
      files: withEntriesFiled(entries.reduce(withAccountsFor, stored.files), entries.map((entry) => ({ date: entry.date, text: renderEntry(entry) }))),
      intent: { type: "days-entered", count: entries.length },
    }),
  )
}
