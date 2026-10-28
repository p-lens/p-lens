import { TALLY_TAGS } from "./tally"
import type { PlayId } from "../play/play"

/** Where an entry stands among a journal's lines: its first line, and the line after its last. */
interface Span {
  readonly start: number
  readonly end: number
}

const tagsOf = (header: string): readonly (readonly [string, string])[] => {
  const comment = header.indexOf(";")
  return comment === -1
    ? []
    : header
        .slice(comment + 1)
        .split(",")
        .map((tag) => tag.split(":"))
        .map(([name, ...value]) => [(name ?? "").trim(), value.join(":").trim()] as const)
}

const isHeaderOf = (line: string, id: PlayId): boolean => /^\d/.test(line) && tagsOf(line).some(([name, value]) => name === TALLY_TAGS.playId && value === id)

const isIndented = (line: string): boolean => /^[ \t]+\S/.test(line)

/** A tally's entry in a journal's lines: its header, tagged with its play's id, and the indented lines under it. */
const spanOf = (lines: readonly string[], id: PlayId): Span | undefined => {
  const start = lines.findIndex((line) => isHeaderOf(line, id))
  if (start === -1) return undefined
  const after = lines.slice(start + 1).findIndex((line) => !isIndented(line))
  return { start, end: after === -1 ? lines.length : start + 1 + after }
}

/**
 * A journal's text with a tally's entry written anew where it stands,
 * every other line as it was; undefined if the journal holds no entry of
 * the tally. The entry keeps its place whatever day it now says: hledger reads
 * entries by their dates, not by where they are written.
 */
export const withTallyEntry = (text: string, id: PlayId, entry: string): string | undefined => {
  const lines = text.split("\n")
  const span = spanOf(lines, id)
  return span === undefined ? undefined : [...lines.slice(0, span.start), ...entry.replace(/\n$/, "").split("\n"), ...lines.slice(span.end)].join("\n")
}

/** A journal's text without a tally's entry, and without the blank line that set it apart; undefined if the journal holds no entry of the tally. */
export const withoutTallyEntry = (text: string, id: PlayId): string | undefined => {
  const lines = text.split("\n")
  const span = spanOf(lines, id)
  if (span === undefined) return undefined
  const following = lines[span.end] === "" ? 1 : 0
  return [...lines.slice(0, span.start), ...lines.slice(span.end + following)].join("\n")
}

const playIdOf = (header: string): PlayId | undefined =>
  ((id) => (id === undefined || id === "" ? undefined : (id as PlayId)))(/^\d/.test(header) ? tagsOf(header).find(([name]) => name === TALLY_TAGS.playId)?.[1] : undefined)

/** A line of comment under an entry that is a note a person wrote: one with a colon in it is tags, which a note never holds. */
const noteIn = (line: string): string | undefined => ((comment) => (comment.startsWith(";") && !comment.includes(":") ? comment.slice(1).trim() : undefined))(line.trim())

/** A tally's notes from one entry's text, its header and the indented lines under it; none for an entry of no tally, or one with no note. */
const notedIn = (entry: string): readonly (readonly [PlayId, string])[] => {
  const [header = "", ...body] = entry.split("\n")
  const id = playIdOf(header)
  const notes = body.map(noteIn).filter((note): note is string => note !== undefined && note !== "")
  return id === undefined || notes.length === 0 ? [] : [[id, notes.join(" ")]]
}

/**
 * The notes written under each tally's entry in a book's journals, by its
 * play's id, several lines one after another: what a person said of a tally
 * beside its figures, such as the memo a tally taken in from another app
 * brought with it. hledger keeps an entry's comment to itself, so it is
 * read from the journals' text, as the app wrote it. A tally with no note
 * is not in it.
 */
export const tallyNotesIn = (journals: readonly string[]): ReadonlyMap<PlayId, string> =>
  new Map(journals.flatMap((text) => text.split(/\n(?![ \t])/).flatMap(notedIn)))
