import type { BookId, MemberId } from "../book/book"
import type { Decimal } from "../decimal/decimal"
import type { BookFiles } from "../journal/layout"
import type { PlayId } from "../play/play"
import { type FilePatch, patchBetween } from "./patch"

/** One file's text before and after a change; `before` is absent for a new file. */
export interface FileChange {
  readonly path: string
  readonly before: string | undefined
  readonly after: string
}

/**
 * Why a book changed, in terms a person reads. What the history shows as an
 * activity is drawn from this, so the files never have to be diffed to say it.
 */
export type ChangeIntent =
  | { readonly type: "book-created" }
  | { readonly type: "book-renamed"; readonly title: string }
  | { readonly type: "file-edited"; readonly path: string }
  | { readonly type: "savings-opened"; readonly parlor: string; readonly tier: string }
  | { readonly type: "savings-adjusted"; readonly parlor: string; readonly tier: string }
  | { readonly type: "savings-exchanged"; readonly parlor: string; readonly tier: string }
  | { readonly type: "pool-opened"; readonly parlor: string; readonly tier: string }
  | { readonly type: "parlors-linked"; readonly names: readonly string[] }
  | { readonly type: "conflict-settled"; readonly paths: readonly string[] }
  | {
      readonly type: "play-recorded"
      readonly playId: PlayId
      readonly description: string
      readonly theoreticalValue: Decimal | undefined
    }
  | {
      readonly type: "play-revised"
      readonly playId: PlayId
      readonly description: string
      readonly theoreticalValue: Decimal | undefined
    }
  | { readonly type: "play-removed"; readonly playId: PlayId; readonly description: string }
  | { readonly type: "plays-imported"; readonly from: string; readonly count: number }
  /** A formula or a 設定配分 kept handy in the book, or let go: written in the book's favourites, which is its own record of it. */
  | { readonly type: "favorite-kept"; readonly target: "formula" | "distribution"; readonly id: string }
  | { readonly type: "favorite-let-go"; readonly target: "formula" | "distribution"; readonly id: string }
  /** A mark given in the shared catalog, or taken back: written in the book's marks, which is its own record of it. */
  | { readonly type: "mark-pressed"; readonly did: string; readonly target: "formula" | "distribution"; readonly id: string }

/**
 * Every change to a book, as one value: who, when, why, and what it did to
 * each file it touched — the lines replaced, not the files whole, so a
 * commit stays small however long a journal grows. Whatever keeps history
 * records one of these as one commit.
 */
export interface JournalChange {
  readonly bookId: BookId
  readonly author: MemberId
  /** ISO 8601, read off the clock at the boundary that made the change. */
  readonly at: string
  readonly intent: ChangeIntent
  readonly files: readonly FilePatch[]
}

/** The files that differ between two versions of a book, in path order. */
export const fileChangesBetween = (before: BookFiles, after: BookFiles): readonly FileChange[] =>
  Object.keys(after)
    .toSorted()
    .flatMap((path) => {
      const previous = before[path]
      const next = after[path] ?? ""
      return previous === next ? [] : [{ path, before: previous, after: next }]
    })

/** What a change did to each file, as it is kept in a commit. */
export const patchesOf = (changes: readonly FileChange[]): readonly FilePatch[] => changes.map((change) => patchBetween(change.path, change.before, change.after))
