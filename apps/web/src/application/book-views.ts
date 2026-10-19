import { daysOfQuery, viewOf, type Need } from "../core/journal/views"
import type { BookSession } from "./book-session"

/**
 * The session a book is read through for a question about a query's days,
 * alone or consolidated:
 * each book seen as only the files the question can count — what moved
 * within the days, or what stood at their end — so that a question about a
 * year reads that year's file. Whatever is asked is answered as the whole
 * book would answer it. A query that is no period's, or one whose days
 * every entry bears on, is asked of the whole.
 */
export const viewedFor = (session: BookSession, query: string, need: Need): BookSession =>
  ((days) =>
    days === undefined || (days.until === undefined && (need === "stood" || days.from === undefined))
      ? session
      : { ...session, read: (bookId, work) => session.readViewed(bookId, (files) => viewOf(files, days, need) ?? files, work) })(daysOfQuery(query))
