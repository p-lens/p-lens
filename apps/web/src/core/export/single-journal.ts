import { ENTRY_FILE, type BookFiles } from "../journal/layout"

const INCLUDE = /^include\s+(.+?)\s*$/

const endingOnce = (text: string): string => `${text.replace(/\n*$/, "")}\n`

/**
 * A file's text with each file it includes written in where the `include`
 * stood, under a comment naming it. An include of a file the book does not
 * hold, or of one already being written in, is left as it is written.
 */
const inlined = (files: BookFiles, path: string, within: readonly string[]): string =>
  (files[path] ?? "")
    .split("\n")
    .map((line) => {
      const included = INCLUDE.exec(line)?.[1]
      return included === undefined || files[included] === undefined || within.includes(included)
        ? line
        : `; ${included}\n${endingOnce(inlined(files, included, [...within, included]))}`
    })
    .join("\n")

/**
 * A book's journals as one file hledger opens by itself: the main journal
 * with every journal it includes written into it, in the order it includes
 * them, nothing else altered. What no journal includes — a play's readings,
 * the activity log — is not in it; an archive carries those.
 */
export const singleJournalOf = (files: BookFiles): string => endingOnce(inlined(files, ENTRY_FILE, [ENTRY_FILE]))
