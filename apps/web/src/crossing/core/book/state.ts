import { patchBetween, patched, type FilePatch } from "../../../core/change/patch"
import type { BookFiles } from "../../../core/journal/layout"
import { Err, Ok, type Result } from "../../../core/result/result"
import type { Change, ChangeId } from "./change"

/**
 * Why a state could not be worked out.
 *
 * - `missing`: a change it descends from is not held yet.
 * - `misfit`: a patch does not fit the text it is made on: the line is broken there.
 * - `file-removed`: a book lost a file, which no change carries.
 */
export type StateProblem =
  | { readonly type: "missing"; readonly id: ChangeId }
  | { readonly type: "misfit"; readonly id: ChangeId | undefined; readonly path: string }
  | { readonly type: "file-removed"; readonly path: string }

/** Files with patches made on them, in order. */
export const madeOn = (files: BookFiles, patches: readonly FilePatch[]): Result<BookFiles, { readonly path: string }> =>
  patches.reduce<Result<BookFiles, { readonly path: string }>>((so, patch) => {
    if (!so.ok) return so
    const after = patched(so.value[patch.path], patch)
    return after.ok ? Ok({ ...so.value, [patch.path]: after.value }) : Err({ path: patch.path })
  }, Ok(files))

/** A patch the other way: what takes a file back from the text it leaves to the text it was made on. */
const inverseOf = (patch: FilePatch): FilePatch => ({
  path: patch.path,
  created: false,
  hunks: patch.hunks.reduce<{ readonly hunks: FilePatch["hunks"]; readonly shift: number }>(
    (so, hunk) => ({ hunks: [...so.hunks, { at: hunk.at + so.shift, removed: hunk.added, added: hunk.removed }], shift: so.shift + hunk.added.length - hunk.removed.length }),
    { hunks: [], shift: 0 },
  ).hunks,
})

const without = (files: BookFiles, path: string): BookFiles => Object.fromEntries(Object.entries(files).filter(([each]) => each !== path))

/** Files with patches taken back, the last first: a file a patch created goes, and must have been emptied to go. */
export const takenBack = (files: BookFiles, patches: readonly FilePatch[]): Result<BookFiles, { readonly path: string }> =>
  patches.toReversed().reduce<Result<BookFiles, { readonly path: string }>>((so, patch) => {
    if (!so.ok) return so
    const before = madeOn(so.value, [inverseOf(patch)])
    if (!before.ok || !patch.created) return before
    return before.value[patch.path] === "" ? Ok(without(before.value, patch.path)) : Err({ path: patch.path })
  }, Ok(files))

/** What turns one state into another, file by file in path order: a book never loses a file, so one gone is a problem. */
export const patchesBetween = (before: BookFiles, after: BookFiles): Result<readonly FilePatch[], StateProblem> => {
  const gone = Object.keys(before).find((path) => after[path] === undefined)
  if (gone !== undefined) return Err({ type: "file-removed", path: gone })
  return Ok(
    Object.keys(after)
      .toSorted()
      .flatMap((path) => (before[path] === after[path] ? [] : [patchBetween(path, before[path], after[path] ?? "")])),
  )
}

/** The changes a device holds, by id. */
export type Held = ReadonlyMap<ChangeId, Change>

/** A state already known: the device's head, whose state is its book. */
export interface Known {
  readonly id: ChangeId
  readonly files: BookFiles
}

/** One change on a chain, under its id. */
type Link = readonly [ChangeId, Change]

/** The changes from `id` up its first parents, until one whose state is had without them: a base, or one the known state's own chain passes. */
const chainUp = (held: Held, id: ChangeId, reachable: ReadonlySet<ChangeId>): Result<readonly Link[], StateProblem> => {
  const walked: { readonly chain: Link[]; at: ChangeId | undefined } = { chain: [], at: id }
  while (walked.at !== undefined && !reachable.has(walked.at)) {
    const change = held.get(walked.at)
    if (change === undefined) return Err({ type: "missing", id: walked.at })
    walked.chain.push([walked.at, change])
    walked.at = change.sort === "base" ? undefined : change.parents[0]
  }
  return Ok(walked.chain)
}

/** The ids on a change's first-parent chain, down to the base it rests on, nearest first. */
const firstParentsOf = (held: Held, id: ChangeId): readonly ChangeId[] => {
  const walked: { readonly ids: ChangeId[]; at: ChangeId | undefined } = { ids: [], at: id }
  while (walked.at !== undefined) {
    const change = held.get(walked.at)
    walked.ids.push(walked.at)
    walked.at = change === undefined || change.sort === "base" ? undefined : change.parents[0]
  }
  return walked.ids
}

/** The state a change leaves, made on the state of its first parent. */
const madeFrom = (files: BookFiles, [id, change]: Link): Result<BookFiles, StateProblem> => {
  if (change.sort === "base") return Ok(change.files)
  const made = madeOn(files, change.patches)
  return made.ok ? made : Err({ type: "misfit", id, path: made.error.path })
}

/** The known state taken back down its chain to one of its first parents. */
const backTo = (held: Held, known: Known, chain: readonly ChangeId[], to: ChangeId): Result<BookFiles, StateProblem> =>
  chain.slice(0, chain.indexOf(to)).reduce<Result<BookFiles, StateProblem>>((so, id) => {
    if (!so.ok) return so
    const change = held.get(id)
    if (change === undefined || change.sort === "base") return Err({ type: "missing", id })
    const back = takenBack(so.value, change.patches)
    return back.ok ? back : Err({ type: "misfit", id, path: back.error.path })
  }, Ok(known.files))

/** Where a chain's working starts: from nothing above a base, or the known state taken back to where the chain meets it. */
const startOf = (held: Held, known: Known | undefined, knownChain: readonly ChangeId[], chain: readonly Link[], id: ChangeId): Result<BookFiles, StateProblem> => {
  const top = chain.at(-1)?.[1]
  if (top?.sort === "base") return Ok({})
  const meeting = top === undefined ? id : top.parents[0]
  return known === undefined || meeting === undefined ? Err({ type: "missing", id }) : backTo(held, known, knownChain, meeting)
}

/**
 * The state a change leaves (PROTOCOL.md §5.1): worked up its first parents
 * to a base, or to the known state's chain, which is taken back as far as
 * that and made forward again. A known state is the device's book, so that
 * most of what is asked of is a few patches away.
 */
export const stateOf = (held: Held, known: Known | undefined, id: ChangeId): Result<BookFiles, StateProblem> => {
  if (known !== undefined && id === known.id) return Ok(known.files)
  const knownChain = known === undefined ? [] : firstParentsOf(held, known.id)
  const chain = chainUp(held, id, new Set(knownChain))
  if (!chain.ok) return chain
  return chain.value.toReversed().reduce<Result<BookFiles, StateProblem>>((so, link) => (so.ok ? madeFrom(so.value, link) : so), startOf(held, known, knownChain, chain.value, id))
}
