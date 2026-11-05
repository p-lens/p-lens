import { BOOK_SETTINGS_FILE } from "../../../core/book/settings"
import type { BookFiles } from "../../../core/journal/layout"
import { Err, Ok, type Result } from "../../../core/result/result"
import { hunksOf, linesOf, textOf, type Hunk } from "../../../core/text/line-diff"
import { canonicalJson, type Json } from "./canonical"
import { ROSTER_FILE } from "./roster"

/** Which of two heads a stretch is: the lower id's, or the higher's (PROTOCOL.md §5.3). */
export type Side = "first" | "second"

/**
 * A stretch of two texts grown from one, as they come together: lines both
 * agree on — untouched, changed by one side, or by both alike — or lines
 * each changed its own way, where one side's must be chosen.
 */
export type MergePart =
  | { readonly type: "agreed"; readonly lines: readonly string[] }
  | { readonly type: "contested"; readonly first: readonly string[]; readonly second: readonly string[] }

/**
 * Why one file did not merge.
 *
 * - `lines`: one stretch changed two ways.
 * - `keys`: a setting set two ways, or settings that do not read as JSON.
 * - `play-twice`: one play recorded on both sides.
 */
export type FileConflict = { readonly path: string; readonly why: "lines" | "keys" | "play-twice" }

/** What would not merge, and every other file as it merged: what a person's choices are made on. */
export type MergeConflict = { readonly type: "conflict"; readonly files: readonly FileConflict[]; readonly merged: BookFiles }

interface Sided {
  readonly side: Side
  readonly hunk: Hunk
}

interface Cluster {
  readonly start: number
  readonly end: number
  readonly members: readonly Sided[]
}

const sameHunk = (left: Hunk, right: Hunk): boolean =>
  left.start === right.start && left.end === right.end && left.lines.length === right.lines.length && left.lines.every((line, index) => line === right.lines[index])

const inserts = (hunk: Hunk): boolean => hunk.start === hunk.end

/** In the base's order; at one place, lines added before lines replaced, and the first side's before the second's. */
const inOrder = (hunks: readonly Sided[]): readonly Sided[] =>
  hunks.toSorted((left, right) => left.hunk.start - right.hunk.start || Number(inserts(right.hunk)) - Number(inserts(left.hunk)) || Number(left.side === "second") - Number(right.side === "second"))

/** Whether a hunk meets a cluster: shares a line of the base with it, or, where lines added at one place may not both be kept, is added where the cluster adds. */
const meets = (cluster: Cluster, hunk: Hunk, bothKept: boolean): boolean =>
  (hunk.start < cluster.end && cluster.start < hunk.end) || (!bothKept && inserts(hunk) && cluster.start === cluster.end && cluster.start === hunk.start)

/** Hunks gathered by the lines of the base they touch; what both sides did alike is one hunk. */
const clustersOf = (first: readonly Hunk[], second: readonly Hunk[], bothKept: boolean): readonly Cluster[] => {
  const unlike = second.filter((hunk) => !first.some((other) => sameHunk(other, hunk)))
  const sided = inOrder([...first.map((hunk): Sided => ({ side: "first", hunk })), ...unlike.map((hunk): Sided => ({ side: "second", hunk }))])
  return sided.reduce<readonly Cluster[]>((clusters, each) => {
    const last = clusters.at(-1)
    return last !== undefined && meets(last, each.hunk, bothKept)
      ? [...clusters.slice(0, -1), { start: last.start, end: Math.max(last.end, each.hunk.end), members: [...last.members, each] }]
      : [...clusters, { start: each.hunk.start, end: each.hunk.end, members: [each] }]
  }, [])
}

const contested = (cluster: Cluster): boolean => cluster.members.some((each) => each.side === "first") && cluster.members.some((each) => each.side === "second")

/** The base's lines from `start` to `end` with one side's hunks made on them. */
const madeOn = (base: readonly string[], start: number, end: number, hunks: readonly Hunk[]): readonly string[] => {
  const written = hunks.reduce<{ readonly lines: readonly string[]; readonly at: number }>((so, hunk) => ({ lines: [...so.lines, ...base.slice(so.at, hunk.start), ...hunk.lines], at: hunk.end }), { lines: [], at: start })
  return [...written.lines, ...base.slice(written.at, end)]
}

const of = (cluster: Cluster, side: Side): readonly Hunk[] => cluster.members.filter((each) => each.side === side).map((each) => each.hunk)

const partOf = (base: readonly string[], cluster: Cluster): MergePart =>
  contested(cluster)
    ? { type: "contested", first: madeOn(base, cluster.start, cluster.end, of(cluster, "first")), second: madeOn(base, cluster.start, cluster.end, of(cluster, "second")) }
    : { type: "agreed", lines: madeOn(base, cluster.start, cluster.end, cluster.members.map((each) => each.hunk)) }

const joined = (parts: readonly MergePart[]): readonly MergePart[] =>
  parts.reduce<readonly MergePart[]>((so, part) => {
    const last = so.at(-1)
    if (part.type === "agreed" && part.lines.length === 0) return so
    return part.type === "agreed" && last?.type === "agreed" ? [...so.slice(0, -1), { type: "agreed", lines: [...last.lines, ...part.lines] }] : [...so, part]
  }, [])

/** Whether lines both sides added at one place are both kept: in a journal, and in a log, which each side only adds to; anywhere else it is a conflict. */
const keepsBothAdded = (path: string): boolean => path.endsWith(".journal") || path.startsWith("logs/")

/**
 * Two texts grown from one, laid out as they come together, line by line:
 * what either side changed, both kept, and the stretches each changed its
 * own way set apart for a choice.
 */
export const outlineOf = (path: string, base: string, first: string, second: string): readonly MergePart[] => {
  const from = linesOf(base)
  const clusters = clustersOf(hunksOf(from, linesOf(first)), hunksOf(from, linesOf(second)), keepsBothAdded(path))
  const walked = clusters.reduce<{ readonly parts: readonly MergePart[]; readonly at: number }>(
    (so, cluster) => ({ parts: [...so.parts, { type: "agreed", lines: from.slice(so.at, cluster.start) }, partOf(from, cluster)], at: cluster.end }),
    { parts: [], at: 0 },
  )
  return joined([...walked.parts, { type: "agreed", lines: from.slice(walked.at) }])
}

/** How many stretches of an outline await a choice. */
export const contestedIn = (parts: readonly MergePart[]): number => parts.filter((part) => part.type === "contested").length

/** An outline as one text, each contested stretch taken from the side picked for it, in order. */
export const settledText = (parts: readonly MergePart[], picks: readonly Side[]): string =>
  textOf(
    parts.reduce<{ readonly lines: readonly string[]; readonly choice: number }>(
      (so, part) => (part.type === "agreed" ? { lines: [...so.lines, ...part.lines], choice: so.choice } : { lines: [...so.lines, ...(picks[so.choice] === "second" ? part.second : part.first)], choice: so.choice + 1 }),
      { lines: [], choice: 0 },
    ).lines,
  )

type Fields = Readonly<Record<string, Json>>

const fieldsOf = (text: string | undefined): Fields | undefined => {
  if (text === undefined) return {}
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Fields) : undefined
  } catch {
    return undefined
  }
}

const same = (left: Json | undefined, right: Json | undefined): boolean => (left === undefined || right === undefined ? left === right : canonicalJson(left) === canonicalJson(right))

/** A file of settings or a roster merged key by key, written as the app writes them; a key set two ways, or a side that does not read, is a conflict. */
const mergedByKey = (base: string | undefined, first: string | undefined, second: string | undefined): string | undefined => {
  const [from, one, other] = [fieldsOf(base), fieldsOf(first), fieldsOf(second)]
  if (from === undefined || one === undefined || other === undefined) return undefined
  const keys = [...new Set([...Object.keys(one), ...Object.keys(other), ...Object.keys(from)])]
  const picked = keys.map((key) => {
    const [was, mine, theirs] = [from[key], one[key], other[key]]
    if (same(mine, theirs) || same(was, theirs)) return { key, value: mine, agreed: true }
    if (same(was, mine)) return { key, value: theirs, agreed: true }
    return { key, value: undefined, agreed: false }
  })
  if (picked.some((each) => !each.agreed)) return undefined
  return `${JSON.stringify(Object.fromEntries(picked.flatMap((each) => (each.value === undefined ? [] : [[each.key, each.value]]))), undefined, 2)}\n`
}

/** The files merged key by key at their top level: a book's settings, and the line's roster (PROTOCOL.md §5.3). */
const KEYED_FILES: ReadonlySet<string> = new Set([BOOK_SETTINGS_FILE, ROSTER_FILE])

/** One file merged: the text it comes to, none where it is not there, or a conflict. */
const mergedFile = (path: string, base: string | undefined, first: string | undefined, second: string | undefined): Result<string | undefined, FileConflict["why"]> => {
  if (first === second || base === second) return Ok(first)
  if (base === first) return Ok(second)
  if (KEYED_FILES.has(path)) return ((text) => (text === undefined ? Err("keys" as const) : Ok(text)))(mergedByKey(base, first, second))
  if (first === undefined || second === undefined || (base === undefined && !keepsBothAdded(path))) return Err("lines")
  const parts = outlineOf(path, base ?? "", first, second)
  return contestedIn(parts) === 0 ? Ok(settledText(parts, [])) : Err("lines")
}

/** A tally's play id on an entry's first line, where it carries one. */
const PLAY_ID = /^\d{4}-\d{2}-\d{2}\b.*[;,]\s*play-id:\s*([^,\s]+)/

/** How many entries carry each play id, over every journal of a book. */
const playsIn = (files: BookFiles): ReadonlyMap<string, number> =>
  Object.entries(files)
    .filter(([path]) => path.endsWith(".journal"))
    .flatMap(([, text]) => linesOf(text).flatMap((line) => ((found) => (found?.[1] === undefined ? [] : [found[1]]))(PLAY_ID.exec(line))))
    .reduce((counted, id) => new Map(counted).set(id, (counted.get(id) ?? 0) + 1), new Map<string, number>())

/** The journals an entry of one of these plays is in. */
const journalsWith = (files: BookFiles, plays: ReadonlySet<string>): readonly string[] =>
  Object.entries(files)
    .filter(([path, text]) => path.endsWith(".journal") && linesOf(text).some((line) => ((found) => found?.[1] !== undefined && plays.has(found[1]))(PLAY_ID.exec(line))))
    .map(([path]) => path)

/** Plays the merge records more often than either side did: one play recorded on both. */
const recordedTwice = (merged: BookFiles, first: BookFiles, second: BookFiles): ReadonlySet<string> => {
  const [all, one, other] = [playsIn(merged), playsIn(first), playsIn(second)]
  return new Set([...all].filter(([id, count]) => count > Math.max(one.get(id) ?? 0, other.get(id) ?? 0)).map(([id]) => id))
}

/**
 * Two heads' states brought together from their merge base's (PROTOCOL.md
 * §5.3), file by file: what only one side changed taken from it, what both
 * changed alike once, lines each added kept in a journal or a log, settings
 * and the roster merged key by key; and every file that would not merge, or
 * a play the merge would record twice, put to a person.
 */
export const mergeStates = (base: BookFiles, first: BookFiles, second: BookFiles): Result<BookFiles, MergeConflict> => {
  const paths = [...new Set([...Object.keys(first), ...Object.keys(second)])].toSorted()
  const merged = paths.map((path) => [path, mergedFile(path, base[path], first[path], second[path])] as const)
  const conflicts = merged.flatMap(([path, made]): FileConflict[] => (made.ok ? [] : [{ path, why: made.error }]))
  const files: BookFiles = Object.fromEntries(merged.flatMap(([path, made]) => (made.ok && made.value !== undefined ? [[path, made.value]] : [])))
  if (conflicts.length > 0) return Err({ type: "conflict", files: conflicts, merged: files })
  const twice = journalsWith(files, recordedTwice(files, first, second))
  return twice.length === 0 ? Ok(files) : Err({ type: "conflict", files: twice.map((path) => ({ path, why: "play-twice" })), merged: Object.fromEntries(Object.entries(files).filter(([path]) => !twice.includes(path))) })
}
