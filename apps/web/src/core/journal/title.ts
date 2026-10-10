import { Err, Ok, type Result } from "../result/result"

/**
 * The comment that names a book: `; book-title-p: サンプル帳簿`. The `p` is
 * the trade's P店, not P-Lens: any tool keeping a pachinko book may write it.
 */
const TITLE_COMMENT = /^;\s*book-title-p:\s*(.*?)\s*$/

/** The comments a main journal opens with, before its first directive. */
const openingComments = (main: string): readonly string[] => {
  const lines = main.split("\n")
  const firstDirective = lines.findIndex((line) => line.trim() !== "" && !line.trimStart().startsWith(";"))
  return firstDirective === -1 ? lines : lines.slice(0, firstDirective)
}

/**
 * A book's title, as its main journal gives it in the comments it opens
 * with; none if it gives none. The journal is the book, so its name is
 * written there too, where hledger passes over it and a person reads it.
 */
export const titleOfMain = (main: string): string | undefined => {
  const title = openingComments(main)
    .map((line) => TITLE_COMMENT.exec(line)?.[1])
    .find((found) => found !== undefined)
  return title === undefined || title === "" ? undefined : title
}

/** The longest a book's title may be: it heads a narrow panel and names a backup's file. */
export const LONGEST_TITLE = 30

/**
 * Why a title cannot be a book's.
 *
 * - `empty`: nothing but spaces.
 * - `too-long`: more than a title has room for.
 * - `unwritable`: a line break, which would end the comment that holds it.
 */
export type TitleProblem = { readonly type: "empty" } | { readonly type: "too-long"; readonly longest: number } | { readonly type: "unwritable" }

/** A title as typed, tidied, or what is wrong with it. */
export const readTitle = (typed: string): Result<string, TitleProblem> => {
  const title = typed.trim()
  if (title === "") return Err({ type: "empty" })
  if (/[\n\r]/.test(title)) return Err({ type: "unwritable" })
  return [...title].length > LONGEST_TITLE ? Err({ type: "too-long", longest: LONGEST_TITLE }) : Ok(title)
}

const titleLine = (title: string): string => `; book-title-p: ${title.trim()}`

/**
 * A main journal naming its book so: the comment that names it rewritten
 * where the journal opens with one, or written as its first line where it
 * has none. Nothing else of the journal is touched.
 */
export const withTitle = (main: string, title: string): string => {
  const lines = main.split("\n")
  const opening = openingComments(main).length
  const named = lines.findIndex((line, index) => index < opening && TITLE_COMMENT.test(line))
  return named === -1 ? [titleLine(title), ...lines].join("\n") : lines.map((line, index) => (index === named ? titleLine(title) : line)).join("\n")
}
