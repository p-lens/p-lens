import { Err, Ok, type Result } from "../result/result"
import { type Hunk, hunksOf, linesOf, textOf } from "../text/line-diff"

/** Both sides changed the same lines of the base, each its own way. */
export type MergeConflict = { readonly type: "conflict" }

/** Which side's lines stand where the two disagree. */
export type Side = "ours" | "theirs"

/**
 * A stretch of two texts grown from one, as they come together: lines both
 * agree on — untouched, or changed by one side, or by both alike — or lines
 * each changed its own way, where one side's must be chosen.
 */
export type MergePart =
  | { readonly type: "agreed"; readonly lines: readonly string[] }
  | { readonly type: "contested"; readonly ours: readonly string[]; readonly theirs: readonly string[] }

/** One side's hunk, and whose it is. */
interface Sided {
  readonly side: Side
  readonly hunk: Hunk
}

/** Hunks that touch the same lines of the base, and the stretch of the base they cover between them. */
interface Cluster {
  readonly start: number
  readonly end: number
  readonly members: readonly Sided[]
}

const sameHunk = (left: Hunk, right: Hunk): boolean =>
  left.start === right.start && left.end === right.end && left.lines.length === right.lines.length && left.lines.every((line, index) => line === right.lines[index])

const inserts = (hunk: Hunk): boolean => hunk.start === hunk.end

/** In the base's order; at one place, lines added come before lines replaced, and theirs before ours. */
const inOrder = (hunks: readonly Sided[]): readonly Sided[] =>
  hunks.toSorted(
    (left, right) =>
      left.hunk.start - right.hunk.start || Number(inserts(right.hunk)) - Number(inserts(left.hunk)) || Number(left.side === "ours") - Number(right.side === "ours"),
  )

const touches = (cluster: Cluster, hunk: Hunk): boolean => hunk.start < cluster.end && cluster.start < hunk.end

/**
 * Hunks gathered by the lines of the base they touch. What both sides did
 * alike is one hunk; lines each added at the same place touch nothing and
 * stay apart, theirs first.
 */
const clustersOf = (theirs: readonly Hunk[], ours: readonly Hunk[]): readonly Cluster[] => {
  const unlike = ours.filter((mine) => !theirs.some((other) => sameHunk(other, mine)))
  const sided = inOrder([...theirs.map((hunk): Sided => ({ side: "theirs", hunk })), ...unlike.map((hunk): Sided => ({ side: "ours", hunk }))])
  return sided.reduce<readonly Cluster[]>((clusters, each) => {
    const last = clusters.at(-1)
    return last !== undefined && touches(last, each.hunk)
      ? [...clusters.slice(0, -1), { start: last.start, end: Math.max(last.end, each.hunk.end), members: [...last.members, each] }]
      : [...clusters, { start: each.hunk.start, end: each.hunk.end, members: [each] }]
  }, [])
}

const contested = (cluster: Cluster): boolean => cluster.members.some((each) => each.side === "ours") && cluster.members.some((each) => each.side === "theirs")

/** The base's lines from `start` to `end` with one side's hunks made on them. */
const madeOn = (base: readonly string[], start: number, end: number, hunks: readonly Hunk[]): readonly string[] => {
  const written = hunks.reduce<{ readonly lines: readonly string[]; readonly at: number }>(
    (so, hunk) => ({ lines: [...so.lines, ...base.slice(so.at, hunk.start), ...hunk.lines], at: hunk.end }),
    { lines: [], at: start },
  )
  return [...written.lines, ...base.slice(written.at, end)]
}

const of = (cluster: Cluster, side: Side): readonly Hunk[] => cluster.members.filter((each) => each.side === side).map((each) => each.hunk)

const partOf = (base: readonly string[], cluster: Cluster): MergePart =>
  contested(cluster)
    ? { type: "contested", ours: madeOn(base, cluster.start, cluster.end, of(cluster, "ours")), theirs: madeOn(base, cluster.start, cluster.end, of(cluster, "theirs")) }
    : { type: "agreed", lines: madeOn(base, cluster.start, cluster.end, cluster.members.map((each) => each.hunk)) }

const joined = (parts: readonly MergePart[]): readonly MergePart[] =>
  parts.reduce<readonly MergePart[]>((so, part) => {
    const last = so.at(-1)
    if (part.type === "agreed" && part.lines.length === 0) return so
    return part.type === "agreed" && last?.type === "agreed" ? [...so.slice(0, -1), { type: "agreed", lines: [...last.lines, ...part.lines] }] : [...so, part]
  }, [])

/**
 * Two texts grown from one, laid out as they come together: line by line,
 * what either side changed, both kept, and the stretches where each changed
 * the same lines its own way set apart for a choice. Entries each device
 * appended to a journal are agreed, theirs first.
 */
export const mergeOutline = (base: string, ours: string, theirs: string): readonly MergePart[] => {
  const from = linesOf(base)
  const clusters = clustersOf(hunksOf(from, linesOf(theirs)), hunksOf(from, linesOf(ours)))
  const walked = clusters.reduce<{ readonly parts: readonly MergePart[]; readonly at: number }>(
    (so, cluster) => ({ parts: [...so.parts, { type: "agreed", lines: from.slice(so.at, cluster.start) }, partOf(from, cluster)], at: cluster.end }),
    { parts: [], at: 0 },
  )
  return joined([...walked.parts, { type: "agreed", lines: from.slice(walked.at) }])
}

/** How many stretches of an outline await a choice. */
export const contestedIn = (parts: readonly MergePart[]): number => parts.filter((part) => part.type === "contested").length

/**
 * An outline as one text, each contested stretch taken from the side picked
 * for it, in order. A stretch with no pick takes theirs: the line's stands
 * until someone says otherwise.
 */
export const settledText = (parts: readonly MergePart[], picks: readonly Side[]): string => {
  const written = parts.reduce<{ readonly lines: readonly string[]; readonly choice: number }>(
    (so, part) =>
      part.type === "agreed"
        ? { lines: [...so.lines, ...part.lines], choice: so.choice }
        : { lines: [...so.lines, ...(picks[so.choice] === "ours" ? part.ours : part.theirs)], choice: so.choice + 1 },
    { lines: [], choice: 0 },
  )
  return textOf(written.lines)
}

/**
 * Two texts grown from one, as one text: what either side changed, both
 * kept. A line both rewrote differently is a conflict for a person.
 */
export const mergeText = (base: string, ours: string, theirs: string): Result<string, MergeConflict> => {
  if (ours === theirs || base === theirs) return Ok(ours)
  if (base === ours) return Ok(theirs)
  const parts = mergeOutline(base, ours, theirs)
  return contestedIn(parts) === 0 ? Ok(settledText(parts, [])) : Err({ type: "conflict" })
}
