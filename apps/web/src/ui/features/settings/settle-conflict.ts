import type { BookId } from "../../../core/book/book"
import type { BookFiles } from "../../../core/journal/layout"
import type { BookLines } from "../sync/book-lines"
import { toast } from "../../primitives/toast"
import { CONFLICT_MOVED, CONFLICT_NOT_SETTLED, CONFLICT_SETTLED, describeBookSyncProblem } from "../../wording/sync"

/** A person's choice in a book's conflict written on its open line, and how it went said. */
export const settleConflict = async (lines: BookLines, bookId: BookId, files: BookFiles): Promise<void> => {
  const line = lines.held.lines.get(bookId)
  const settled = line === undefined ? undefined : await line.book.settle(files)
  if (settled?.ok === true) return toast({ title: CONFLICT_SETTLED })
  toast(settled !== undefined && !settled.ok && settled.error.type !== "moved" ? { title: CONFLICT_NOT_SETTLED, description: describeBookSyncProblem(settled.error), tone: "error" } : { title: CONFLICT_NOT_SETTLED, description: CONFLICT_MOVED, tone: "error" })
}
