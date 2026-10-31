import type { JournalChange } from "../change/journal-change"
import type { FilePatch, PatchHunk } from "../change/patch"
import { changeText } from "./codec"

/** What a patch puts around its hunks as a change is written out, beside its path. */
const PATCH_ROOM = 64

/** What a hunk puts around its lines as a change is written out: the names of its fields, and where it begins. */
const HUNK_ROOM = 48

/** How many bytes a text comes to in UTF-8: one for each of its units, one more for each beyond ASCII, and one more again for each written in three bytes. */
const utf8Length = (text: string): number =>
  text.length + text.replace(/[^\u0080-\uffff]/g, "").length + text.replace(/[^\u0800-\ud7ff\ue000-\uffff]/g, "").length

/** How many bytes a text comes to written out in a change, as JSON writes it in UTF-8, with the comma after it. */
const bytesOf = (text: string): number => utf8Length(JSON.stringify(text)) + 1

const linesBytes = (lines: readonly string[]): number => lines.reduce((total, line) => total + bytesOf(line), 0)

const hunkBytes = (hunk: PatchHunk): number => HUNK_ROOM + linesBytes(hunk.removed) + linesBytes(hunk.added)

/** One file's part of a commit made of a larger change: its hunks, as they fall on the file as the commits before it leave it. */
interface Part {
  readonly path: string
  readonly created: boolean
  readonly hunks: readonly PatchHunk[]
  readonly bytes: number
}

/** Lines cut into runs, in order, each as large as `room` lets it be, and at least one line. */
const runsOf = (lines: readonly string[], room: number): readonly (readonly string[])[] =>
  lines
    .reduce<readonly { readonly at: number; readonly end: number; readonly bytes: number }[]>((runs, line, index) => {
      const last = runs.at(-1)
      const bytes = bytesOf(line)
      return last !== undefined && last.bytes + bytes <= room
        ? [...runs.slice(0, -1), { at: last.at, end: index + 1, bytes: last.bytes + bytes }]
        : [...runs, { at: index, end: index + 1, bytes }]
    }, [])
    .map((run) => lines.slice(run.at, run.end))

/** A hunk too large for a commit as hunks made one after another where it is put: its lines taken out a run at a time, then the lines it puts in. */
const cutHunk = (hunk: PatchHunk, room: number): readonly PatchHunk[] => {
  const taken = runsOf(hunk.removed, room).map((run) => ({ at: hunk.at, removed: run, added: [] }))
  const given = runsOf(hunk.added, room).reduce<{ readonly hunks: readonly PatchHunk[]; readonly at: number }>(
    (so, run) => ({ hunks: [...so.hunks, { at: so.at, removed: [], added: run }], at: so.at + run.length }),
    { hunks: [], at: hunk.at },
  )
  return [...taken, ...given.hunks]
}

const shiftOf = (hunks: readonly PatchHunk[]): number => hunks.reduce((shift, hunk) => shift + hunk.added.length - hunk.removed.length, 0)

/**
 * A file's patch as parts made one after another, each within `room`:
 * its hunks gathered in order as many as fit, and a hunk that fits in
 * none cut into hunks of its own. Each part's hunks are where they fall
 * once the parts before it are made, moved by what those added and took.
 */
const partsOf = (patch: FilePatch, room: number): readonly Part[] => {
  const head = PATCH_ROOM + bytesOf(patch.path)
  const lineRoom = room - head - HUNK_ROOM
  const placed = patch.hunks.reduce<{ readonly parts: readonly (readonly PatchHunk[])[]; readonly open: readonly PatchHunk[]; readonly shift: number }>(
    (so, hunk) => {
      const moved = { ...hunk, at: hunk.at + so.shift }
      const openBytes = head + so.open.reduce((total, each) => total + hunkBytes(each), 0)
      if (openBytes + hunkBytes(hunk) <= room) return { ...so, open: [...so.open, moved] }
      const closed = so.open.length === 0 ? so.parts : [...so.parts, so.open]
      const shift = so.shift + shiftOf(so.open)
      if (head + hunkBytes(hunk) <= room) return { parts: closed, open: [{ ...hunk, at: hunk.at + shift }], shift }
      return { parts: [...closed, ...cutHunk({ ...hunk, at: hunk.at + shift }, lineRoom).map((cut) => [cut])], open: [], shift: shift + shiftOf([hunk]) }
    },
    { parts: [], open: [], shift: 0 },
  )
  const parts = placed.open.length === 0 ? placed.parts : [...placed.parts, placed.open]
  const made = parts.length === 0 ? [[]] : parts
  return made.map((hunks, index) => ({ path: patch.path, created: patch.created && index === 0, hunks, bytes: head + hunks.reduce((total, hunk) => total + hunkBytes(hunk), 0) }))
}

/**
 * A change as changes no larger than `room` bytes written out, which made
 * one after another do what it does: the change itself where it fits, and
 * otherwise its files' patches cut into parts and gathered in order, each
 * change saying what the whole said, by whom and when. A file's parts go
 * in different changes, one after another; a line longer than `room` is a
 * part of its own, and too large however it is cut.
 */
export const fittedChanges = (change: JournalChange, room: number): readonly JournalChange[] => {
  if (utf8Length(changeText(change)) <= room) return [change]
  const left = room - utf8Length(changeText({ ...change, files: [] }))
  return change.files
    .flatMap((patch) => partsOf(patch, left))
    .reduce<readonly { readonly parts: readonly Part[]; readonly bytes: number }[]>((changes, part) => {
      const last = changes.at(-1)
      return last !== undefined && last.bytes + part.bytes <= left && last.parts.every((held) => held.path !== part.path)
        ? [...changes.slice(0, -1), { parts: [...last.parts, part], bytes: last.bytes + part.bytes }]
        : [...changes, { parts: [part], bytes: part.bytes }]
    }, [])
    .map((each) => ({ ...change, files: each.parts.map(({ path, created, hunks }) => ({ path, created, hunks })) }))
}
