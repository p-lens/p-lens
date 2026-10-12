import { roleIn, type Book, type MemberId } from "../../core/book/book"
import type { Place } from "./place"

/**
 * Where the app is entered at `/`, where nothing lives: the first book on
 * the rail — the first of one's own, or of those others let one into
 * where one has none — at its side panel, with nothing of it opened yet. A
 * device with no book at all is entered at the live space.
 */
export const entranceOf = (books: readonly Book[], member: MemberId): Place => {
  const top = books.find((book) => roleIn(book, member) === "owner") ?? books.at(0)
  return top === undefined ? { kind: "live" } : { kind: "book", bookId: top.id }
}
