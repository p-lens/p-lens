import { PLAY_TAGS, type PlayId } from "./play"

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

const isHeaderOf = (line: string, id: PlayId): boolean => /^\d/.test(line) && tagsOf(line).some(([name, value]) => name === PLAY_TAGS.playId && value === id)

const isIndented = (line: string): boolean => /^[ \t]+\S/.test(line)

/** A play's entry in a journal's lines: its header, tagged with the play's id, and the indented lines under it. */
const spanOf = (lines: readonly string[], id: PlayId): Span | undefined => {
  const start = lines.findIndex((line) => isHeaderOf(line, id))
  if (start === -1) return undefined
  const after = lines.slice(start + 1).findIndex((line) => !isIndented(line))
  return { start, end: after === -1 ? lines.length : start + 1 + after }
}

/**
 * A journal's text with a play's entry written anew where it stands, every
 * other line as it was; undefined if the journal holds no entry of the
 * play. The entry keeps its place whatever day it now says: hledger reads
 * entries by their dates, not by where they are written.
 */
export const withPlayEntry = (text: string, id: PlayId, entry: string): string | undefined => {
  const lines = text.split("\n")
  const span = spanOf(lines, id)
  return span === undefined ? undefined : [...lines.slice(0, span.start), ...entry.replace(/\n$/, "").split("\n"), ...lines.slice(span.end)].join("\n")
}

/** A journal's text without a play's entry, and without the blank line that set it apart; undefined if the journal holds no entry of the play. */
export const withoutPlayEntry = (text: string, id: PlayId): string | undefined => {
  const lines = text.split("\n")
  const span = spanOf(lines, id)
  if (span === undefined) return undefined
  const following = lines[span.end] === "" ? 1 : 0
  return [...lines.slice(0, span.start), ...lines.slice(span.end + following)].join("\n")
}
