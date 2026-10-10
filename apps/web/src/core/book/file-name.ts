import type { BookId } from "./book"

/** A name with what no file system takes in a file's name set aside. */
const fileSafe = (name: string): string =>
  name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")

/** What a file made from a book is named by, before what kind of file it is: the book's title, or its id where it has none. */
export const fileStemOf = (title: string | undefined, bookId: BookId): string => {
  const named = fileSafe(title ?? "")
  return named === "" ? fileSafe(bookId) : named
}
