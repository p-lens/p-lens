import { ACTIVITY_LOG } from "../activity/activity"
import { BOOK_FILES } from "../journal/layout"
import { withTitle } from "../journal/title"
import { BOOK_SETTINGS_FILE } from "./settings"

type Files = Readonly<Record<string, string>>

/** What a book's files say apart from what naming it, placing it among its owner's books and logging those wrote: its settings and its log set aside, its title blanked. */
const said = (files: Files): Files =>
  Object.fromEntries(
    Object.entries(files)
      .filter(([path, text]) => path !== BOOK_SETTINGS_FILE && path !== ACTIVITY_LOG && text !== "")
      .map(([path, text]) => [path, path === BOOK_FILES.main ? withTitle(text, "") : text]),
  )

/**
 * Whether a book holds nothing a person put in it: its files are a fresh
 * book's, but for its name, its settings and its log. A play, a parlor's
 * pool, a price, a line typed into a file — any of them, and it is touched.
 * A book made by an older version, whose fresh book was written otherwise,
 * reads as touched too: the mistake is on the side that asks before
 * deleting.
 */
export const isUntouched = (files: Files, fresh: Files): boolean => {
  const [held, begun] = [said(files), said(fresh)]
  const paths = Object.keys({ ...held, ...begun })
  return paths.every((path) => held[path] === begun[path])
}
