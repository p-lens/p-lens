import { Err, Ok, type Result } from "../result/result"
import { hunksOf, linesOf, textOf } from "../text/line-diff"

/** A stretch of a file's lines replaced: where it began in the text before, the lines that were there, and those there after. */
export interface PatchHunk {
  readonly at: number
  readonly removed: readonly string[]
  readonly added: readonly string[]
}

/**
 * What a change did to one file, as the lines it replaced rather than the
 * whole text twice: small however long the file has grown. It keeps the
 * lines it took away as well as those it put in, so it can be made, taken
 * back, and checked against the text it is made on either way.
 */
export interface FilePatch {
  readonly path: string
  /** The file was not there before. */
  readonly created: boolean
  readonly hunks: readonly PatchHunk[]
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const isLines = (value: unknown): boolean => Array.isArray(value) && value.every((line) => typeof line === "string")

const isHunk = (value: unknown): boolean =>
  isRecord(value) && typeof value["at"] === "number" && Number.isInteger(value["at"]) && value["at"] >= 0 && isLines(value["removed"]) && isLines(value["added"])

/** Whether a value read from text is a patch: what arrives from elsewhere, or was kept in a file, is not taken on trust. */
export const isFilePatch = (value: unknown): value is FilePatch =>
  isRecord(value) && typeof value["path"] === "string" && typeof value["created"] === "boolean" && Array.isArray(value["hunks"]) && value["hunks"].every(isHunk)

/** The text a patch was to be made on, or taken back from, is not the one it was written against. */
export type PatchProblem = { readonly type: "patch-misfit"; readonly path: string }

/** What turned one text of a file into another, as a patch. */
export const patchBetween = (path: string, before: string | undefined, after: string): FilePatch => {
  const from = linesOf(before ?? "")
  return {
    path,
    created: before === undefined,
    hunks: hunksOf(from, linesOf(after)).map((hunk) => ({ at: hunk.start, removed: from.slice(hunk.start, hunk.end), added: hunk.lines })),
  }
}

const sameLines = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((line, index) => line === right[index])

/** Lines with each stretch `taken` out and `given` in its place, if every stretch taken is what the lines hold there. */
const replaced = (
  lines: readonly string[],
  stretches: readonly { readonly at: number; readonly taken: readonly string[]; readonly given: readonly string[] }[],
): readonly string[] | undefined => {
  if (stretches.some((stretch) => !sameLines(lines.slice(stretch.at, stretch.at + stretch.taken.length), stretch.taken))) return undefined
  const written = stretches.reduce<{ readonly lines: readonly string[]; readonly at: number }>(
    (so, stretch) => ({ lines: [...so.lines, ...lines.slice(so.at, stretch.at), ...stretch.given], at: stretch.at + stretch.taken.length }),
    { lines: [], at: 0 },
  )
  return [...written.lines, ...lines.slice(written.at)]
}

/** A file's text once a patch is made on it; `before` is absent for a file the patch creates. */
export const patched = (before: string | undefined, patch: FilePatch): Result<string, PatchProblem> => {
  const made = (before === undefined) === patch.created ? replaced(linesOf(before ?? ""), patch.hunks.map((hunk) => ({ at: hunk.at, taken: hunk.removed, given: hunk.added }))) : undefined
  return made === undefined ? Err({ type: "patch-misfit", path: patch.path }) : Ok(textOf(made))
}

/** Where each hunk begins in the text after the patch: its place before, moved by what the hunks ahead of it added and took. */
const placesAfter = (hunks: readonly PatchHunk[]): readonly number[] =>
  hunks.reduce<{ readonly places: readonly number[]; readonly shift: number }>(
    (so, hunk) => ({ places: [...so.places, hunk.at + so.shift], shift: so.shift + hunk.added.length - hunk.removed.length }),
    { places: [], shift: 0 },
  ).places

/** A file's text with a patch taken back: absent, where the patch had created the file. */
export const unpatched = (after: string | undefined, patch: FilePatch): Result<string | undefined, PatchProblem> => {
  const places = placesAfter(patch.hunks)
  const taken =
    after === undefined ? undefined : replaced(linesOf(after), patch.hunks.map((hunk, index) => ({ at: places[index] ?? 0, taken: hunk.added, given: hunk.removed })))
  if (taken === undefined) return Err({ type: "patch-misfit", path: patch.path })
  return Ok(patch.created ? undefined : textOf(taken))
}
