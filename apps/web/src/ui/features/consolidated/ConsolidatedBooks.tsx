import { createResource, type JSX } from "solid-js"

import type { BookId } from "../../../core/book/book"
import { useApp } from "../../context"
import { TickFilter, type Offered } from "../../primitives/filter"
import { bookTitle } from "../../wording/book"

/**
 * The books a consolidated view is of, behind a funnel at the end of the
 * view's first row: a tick to each book, in the books' order, every book
 * on the device until some are left out, which is what `undefined` says.
 * Under a book that is ticked and could not be read is why, and that what
 * is shown does not hold it. Which books are read is changed where their
 * figures are, and the address holds it.
 */
export function ConsolidatedBooks(props: { readonly bookIds: readonly BookId[] | undefined; readonly unread: (id: BookId) => string | undefined; readonly onChosen: (bookIds: readonly BookId[] | undefined) => void }): JSX.Element {
  const app = useApp()
  const [listed] = createResource(() => app.revision(), () => app.services.session.books())
  const offered = (): readonly Offered[] =>
    ((found) => (found?.ok === true ? found.value.map((book) => ({ key: book.id, label: bookTitle(book), note: ((why) => (why === undefined ? undefined : `${why}（合計に入っていません）`))(props.unread(book.id)) })) : []))(listed())
  return <TickFilter label="連結する帳簿" offered={offered()} none="連結できる帳簿がありません。" chosen={props.bookIds} onChosen={(chosen) => props.onChosen(chosen as readonly BookId[] | undefined)} class="ml-auto" />
}
