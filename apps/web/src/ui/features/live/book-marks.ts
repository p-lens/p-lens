import { createMemo, createResource } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { loadMarks, pressMark } from "../../../application/marks"
import type { CatalogTarget } from "../../../core/catalog/catalog"
import type { MyMarks } from "../../../core/formula/standing"
import { NO_MARKS, deedOf, type PressedMark } from "../../../core/marks/marks"
import { useApp } from "../../context"
import { useBookInUse } from "./book-in-use"

export interface BookMarks {
  /** What this member holds on a formula or a 設定配分, as the book in use says; nothing, while the book is still being read. */
  readonly of: (id: string) => MyMarks
  /** A mark set or cleared on a formula or a 設定配分 of a machine; `done` is told once the catalog and the book have it. */
  readonly press: (target: CatalogTarget, machineId: string, mark: PressedMark, on: boolean, failed: (error: ApplicationError) => void, done?: () => void) => void
}

const NONE: ReadonlyMap<string, MyMarks> = new Map()

/**
 * This member's marks in the book in use, for the screens that show and
 * set them. They are the book's, so every device the book reaches shows
 * the same. With no book this member may write, nothing is held and a
 * press is refused as any write would be.
 */
export const useBookMarks = (): BookMarks => {
  const app = useApp()
  const book = useBookInUse()
  const [read] = createResource(
    () => {
      const id = book()?.bookId
      return id === undefined ? undefined : { bookId: id, revision: app.revision() }
    },
    (source) => loadMarks(app.services.session, source.bookId, app.services.member),
  )
  const held = createMemo((): ReadonlyMap<string, MyMarks> => {
    const found = read()
    return found?.ok === true ? found.value : NONE
  })
  return {
    of: (id) => held().get(id) ?? NO_MARKS,
    press: (target, machineId, mark, on, failed, done) => {
      const bookId = book()?.bookId
      const did = deedOf(mark, on)
      if (bookId === undefined) {
        failed({ type: "forbidden", capability: "write" })
        return
      }
      if (did === undefined) {
        failed({ type: "catalog", error: { type: "check-stands" } })
        return
      }
      void pressMark(app.services.session, app.services.catalog, app.services.voter, bookId, {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        by: app.services.member,
        did,
        target,
        machineId,
      }).then((pressed) => {
        if (!pressed.ok) {
          failed(pressed.error)
          return
        }
        app.wrote()
        app.delivery.refresh()
        done?.()
      })
    },
  }
}
