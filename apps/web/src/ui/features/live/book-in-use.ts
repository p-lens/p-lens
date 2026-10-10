import { createMemo, createResource, type Accessor } from "solid-js"

import { bookInUse, type BookId } from "../../../core/book/book"
import { useApp } from "../../context"

/**
 * The book in use — the first this member may write, where a heart and a
 * mark are written — as its id: undefined while the books are being read,
 * and none where this member may write no book.
 */
export const useBookInUse = (): Accessor<{ readonly bookId: BookId | undefined } | undefined> => {
  const app = useApp()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  const bookId = createMemo((): BookId | undefined => {
    const found = books()
    return found?.ok === true ? bookInUse(found.value, app.services.member) : undefined
  })
  return createMemo(() => (books() === undefined ? undefined : { bookId: bookId() }))
}
