import type { BookId, MemberId } from "../book/book"
import type { BusinessDayTurn, IsoDate } from "../calendar/calendar"
import type { TokenKind } from "../commodity/commodity"
import type { Decimal } from "../decimal/decimal"
import type { BookFiles } from "../journal/layout"
import type { PlayGameKind, PlayId } from "../play/play"
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
  /** A book given its place among its owner's books: written in the book's settings, and no change to what the book records. */
  | { readonly type: "book-placed"; readonly order: number }
  /** The hour its owner's business day turns over at, written in the book's settings: no change to what the book records, a tally already written keeping its day. */
  | { readonly type: "business-day-turn-set"; readonly turn: BusinessDayTurn }
  /** What a press of a live play's buttons adds at a corner, written in the book's settings: no change to what the book records. */
  | { readonly type: "presses-set"; readonly corner: string }
  /** The terms a tally of a game typed in by hand was weighed on, written in the book's settings for the next to open on: no change to what the book records. */
  | { readonly type: "inference-terms-set"; readonly game: PlayGameKind }
  | { readonly type: "file-edited"; readonly path: string }
  /** A pool's savings registered as they stood on a day: so many tokens. */
  | { readonly type: "savings-opened"; readonly parlor: string; readonly tier: string; readonly date: IsoDate; readonly kind: TokenKind; readonly tokens: Decimal }
  /** A pool's savings put right as of a day: to so many tokens, whatever the book had said. */
  | { readonly type: "savings-adjusted"; readonly parlor: string; readonly tier: string; readonly date: IsoDate; readonly kind: TokenKind; readonly tokens: Decimal }
  /** So many of a pool's tokens exchanged on a day, for special prizes worth so many yen. */
  | { readonly type: "savings-exchanged"; readonly parlor: string; readonly tier: string; readonly date: IsoDate; readonly kind: TokenKind; readonly tokens: Decimal; readonly specialPrizes: Decimal }
  /** So many of a pool's tokens taken back by the parlor on a day. */
  | { readonly type: "savings-forfeited"; readonly parlor: string; readonly tier: string; readonly date: IsoDate; readonly kind: TokenKind; readonly tokens: Decimal }
  /** A pool made ready in the book, exchanging at a rate from a day. */
  | { readonly type: "pool-opened"; readonly parlor: string; readonly tier: string; readonly date: IsoDate; readonly rate: Decimal }
  /** A pool's exchange rate set from a day. */
  | { readonly type: "rate-changed"; readonly parlor: string; readonly tier: string; readonly date: IsoDate; readonly rate: Decimal }
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
  /** A year's entries moved, as they were written, from the transactions not filed by year into that year's file: so many of them. */
  | { readonly type: "year-filed"; readonly year: number; readonly count: number }
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
