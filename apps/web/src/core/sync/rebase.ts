import { ACTIVITY_LOG, retold } from "../activity/activity"
import type { JournalChange } from "../change/journal-change"
import { type FilePatch, patchBetween, patched, unpatched } from "../change/patch"
import type { BookFiles } from "../journal/layout"
import { Err, Ok, type Result } from "../result/result"
import { mergeOutline, mergeText, settledText } from "./merge"

/** A commit as sync reads one: a change, whatever else it is kept with. */
export interface Changing {
  readonly change: JournalChange
}

/**
 * Why a book cannot be brought together with its line.
 *
 * - `diverged`: the book's files are not what its unsent commits left, so
 *   what the line last saw of it cannot be worked back to.
 * - `line-broken`: a commit on the line does not start from what the one
 *   before it left.
 * - `conflict`: a commit here and one on the line rewrote the same lines of
 *   a file, each its own way.
 */
export type RebaseProblem =
  | { readonly type: "diverged"; readonly path: string }
  | { readonly type: "line-broken"; readonly path: string }
  | { readonly type: "conflict"; readonly path: string }

const holding = (files: BookFiles, path: string, text: string | undefined): BookFiles =>
  text === undefined ? Object.fromEntries(Object.entries(files).filter(([each]) => each !== path)) : { ...files, [path]: text }

const undone = (files: BookFiles, patch: FilePatch): Result<BookFiles, RebaseProblem> => {
  const before = unpatched(files[patch.path], patch)
  return before.ok ? Ok(holding(files, patch.path, before.value)) : Err({ type: "diverged", path: patch.path })
}

const done = (files: BookFiles, patch: FilePatch): Result<BookFiles, RebaseProblem> => {
  const after = patched(files[patch.path], patch)
  return after.ok ? Ok(holding(files, patch.path, after.value)) : Err({ type: "line-broken", path: patch.path })
}

const through = (files: BookFiles, patches: readonly FilePatch[], step: (files: BookFiles, patch: FilePatch) => Result<BookFiles, RebaseProblem>): Result<BookFiles, RebaseProblem> =>
  patches.reduce<Result<BookFiles, RebaseProblem>>((so, patch) => (so.ok ? step(so.value, patch) : so), Ok(files))

/** The files as the line last saw them: the book's, with its unsent commits taken back, newest first. */
export const lineFilesOf = (files: BookFiles, unsent: readonly Changing[]): Result<BookFiles, RebaseProblem> =>
  through(files, unsent.flatMap((commit) => commit.change.files).toReversed(), undone)

/** The line's files once the commits received from it are made, oldest first. */
export const received = (line: BookFiles, commits: readonly Changing[]): Result<BookFiles, RebaseProblem> =>
  through(line, commits.flatMap((commit) => commit.change.files), done)

/** Unsent commits made again on top of the line as it now is, and the files they leave. */
export interface Rebased<C extends Changing> {
  readonly commits: readonly C[]
  readonly files: BookFiles
}

/** What a rebase does where a commit and the line rewrote the same lines. */
export type Meeting = "stop" | "yield"

/** Where a rebase stands between two commits: the files as the commits first left them, and as they leave them made again. */
interface Standing<C extends Changing> extends Rebased<C> {
  readonly was: BookFiles
}

/**
 * One file's patch made again: what it changed, read off the text it was
 * first made on, merged into the text the line now has, and written as the
 * patch from that text to the merged one — or to what `rewritten` makes of
 * the merged one, where the file says something of the commit itself.
 */
const patchRebased = (was: BookFiles, now: BookFiles, patch: FilePatch, meeting: Meeting, rewritten: (merged: string) => string = (merged) => merged): Result<{ readonly was: BookFiles; readonly now: BookFiles; readonly patch: FilePatch }, RebaseProblem> => {
  const before = was[patch.path]
  const after = patched(before, patch)
  if (!after.ok) return Err({ type: "diverged", path: patch.path })
  const standing = now[patch.path]
  const merged = meeting === "yield" ? Ok(settledText(mergeOutline(before ?? "", after.value, standing ?? ""), [])) : mergeText(before ?? "", after.value, standing ?? "")
  if (!merged.ok) return Err({ type: "conflict", path: patch.path })
  const text = rewritten(merged.value)
  return Ok({ was: { ...was, [patch.path]: after.value }, now: { ...now, [patch.path]: text }, patch: patchBetween(patch.path, standing, text) })
}

/** Where a commit being made again stands between two of its files. */
interface Remaking {
  readonly was: BookFiles
  readonly now: BookFiles
  readonly patches: readonly FilePatch[]
}

/**
 * A commit made again, file by file — the book's activity last, since the
 * line the commit wrote there holds what it did to the others: made again,
 * it does something else to them, and its line is told so (`retold`), or
 * the activity made in order from nothing would no longer leave the book.
 */
const commitRebased = <C extends Changing>(so: Standing<C>, commit: C, meeting: Meeting): Result<Standing<C>, RebaseProblem> => {
  const remaking = (made: Result<Remaking, RebaseProblem>, patch: FilePatch, rewritten?: (merged: string) => string): Result<Remaking, RebaseProblem> => {
    if (!made.ok) return made
    const moved = patchRebased(made.value.was, made.value.now, patch, meeting, rewritten)
    return moved.ok ? Ok({ was: moved.value.was, now: moved.value.now, patches: [...made.value.patches, moved.value.patch] }) : moved
  }
  const others = commit.change.files.filter((patch) => patch.path !== ACTIVITY_LOG).reduce<Result<Remaking, RebaseProblem>>((made, patch) => remaking(made, patch), Ok({ was: so.was, now: so.files, patches: [] }))
  const remade = commit.change.files
    .filter((patch) => patch.path === ACTIVITY_LOG)
    .reduce<Result<Remaking, RebaseProblem>>(
      (made, patch) => (made.ok ? remaking(made, patch, (merged) => retold(merged, patch.hunks.flatMap((hunk) => hunk.added), made.value.patches)) : made),
      others,
    )
  return remade.ok
    ? Ok({ was: remade.value.was, files: remade.value.now, commits: [...so.commits, { ...commit, change: { ...commit.change, files: remade.value.patches } }] })
    : remade
}

/**
 * Unsent commits, oldest first, each made again on the files the line now
 * has: what it changed merged, file by file, into what is there. `was` is
 * the line as the commits were first made on it. Where a commit and the line
 * rewrote the same lines, `stop` ends it as a conflict and `yield` lets the
 * line's stand, the commit keeping the rest of what it did.
 */
export const rebased = <C extends Changing>(was: BookFiles, line: BookFiles, unsent: readonly C[], meeting: Meeting): Result<Rebased<C>, RebaseProblem> => {
  const made = unsent.reduce<Result<Standing<C>, RebaseProblem>>((so, commit) => (so.ok ? commitRebased(so.value, commit, meeting) : so), Ok({ was, files: line, commits: [] }))
  return made.ok ? Ok({ commits: made.value.commits, files: made.value.files }) : made
}
