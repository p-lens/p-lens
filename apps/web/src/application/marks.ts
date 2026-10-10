import type { BookId, MemberId } from "../core/book/book"
import type { MyMarks } from "../core/formula/standing"
import { marksOf, pressOf, withMarkLine, type MarkLine } from "../core/marks/marks"
import { Ok, mapOk } from "../core/result/result"
import type { Catalog } from "../catalog/port/catalog"
import type { BookSession } from "./book-session"
import { markTarget } from "./catalog"
import type { Outcome } from "./errors"

/**
 * The name a member of a book is counted under in the shared catalog: the
 * same wherever the book is opened, so a person's devices that hold the
 * book are one voter between them, and telling nothing of the book.
 */
export type VoterOf = (bookId: BookId, member: MemberId) => Promise<string>

/** What a member holds on each formula and 設定配分 they marked, as their book says. */
export const loadMarks = (session: BookSession, bookId: BookId, member: MemberId): Promise<Outcome<ReadonlyMap<string, MyMarks>>> =>
  session.read(bookId, async (_journal, stored) => Ok(marksOf(stored.files, member)))

/**
 * A press of a mark, as the line it is: told to the shared catalog, which
 * may refuse it, then written in the book. The catalog is told here and
 * nowhere else — a book's marks read on another device, from a backup or
 * off its line are only read, and never sent again.
 */
export const pressMark = async (session: BookSession, catalog: Catalog, voterOf: VoterOf, bookId: BookId, press: MarkLine): Promise<Outcome<void>> => {
  const { mark, on } = pressOf(press.did)
  const told = await markTarget(catalog, press.target, mark, on, await voterOf(bookId, press.by))
  if (!told.ok) return told
  const written = await session.write(bookId, async (_journal, stored) =>
    Ok({ files: withMarkLine(stored.files, press), intent: { type: "mark-pressed", did: press.did, target: press.target.type, id: press.target.id } }),
  )
  return mapOk(written, () => undefined)
}
