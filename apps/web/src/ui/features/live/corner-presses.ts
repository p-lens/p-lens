import { createResource, createSignal, type Accessor } from "solid-js"

import { setPresses } from "../../../application/presses"
import type { BookId } from "../../../core/book/book"
import type { PressAmounts } from "../../../core/book/settings"
import { useApp } from "../../context"
import { useBookInUse } from "./book-in-use"

/**
 * What a press of a live play's buttons adds at its corner, and a way to
 * set it: kept for good in the settings of the book the play is kept in —
 * the one said for it, else the book in use — under what the corner is
 * called (`4円パチ`), so every play at a corner of that rate, any day and
 * at any parlor, starts from it. What is set holds on screen at once,
 * whether or not the book took it.
 */
export const useCornerPresses = (bookOfPlay: Accessor<BookId | undefined>, corner: Accessor<string>): { readonly presses: Accessor<PressAmounts>; readonly set: (changed: PressAmounts) => void } => {
  const app = useApp()
  const inUse = useBookInUse()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  const bookId = (): BookId | undefined => bookOfPlay() ?? inUse()?.bookId
  const [set, setSet] = createSignal<PressAmounts>({})
  const kept = (): PressAmounts => ((found) => (found?.ok === true ? (found.value.find((book) => book.id === bookId())?.presses[corner()] ?? {}) : {}))(books())
  const presses = (): PressAmounts => ({ ...kept(), ...set() })
  return {
    presses,
    set: (changed) => {
      const amounts = { ...presses(), ...changed }
      setSet(amounts)
      const id = bookId()
      if (id !== undefined) void setPresses(app.services.session, id, corner(), amounts)
    },
  }
}
