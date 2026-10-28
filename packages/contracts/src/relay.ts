/**
 * What crosses between a device and a relay, as JSON. A relay keeps a line
 * for each book being synced: sealed commits in the order it took them. It
 * holds nothing it can read — a commit is sealed on the device that made it —
 * and an official relay and a self-hosted one speak exactly this.
 *
 * A line is named by an id only the devices that share its secret can work
 * out, and every request carries the line's access token as
 * `Authorization: Bearer …`. The first commits sent to a line make it, and
 * its token is whatever came with them.
 */

/** One commit as a relay keeps it: its id, to tell it has it already, and the rest sealed. */
export interface SealedCommitDto {
  readonly commitId: string
  /** The commit's change, sealed: base64url. */
  readonly box: string
}

/** A sealed commit at its place in its line, counted from 1. */
export interface LineEntryDto extends SealedCommitDto {
  readonly seq: number
}

/**
 * A line's entries after some place in it, where the line now ends, and
 * when it was begun: a relay lets go of a line left idle, and a line made
 * again under the same id is told from the one before by this.
 */
export interface LineEntriesDto {
  readonly head: number
  readonly begunAt: string
  readonly entries: readonly LineEntryDto[]
}

/**
 * How long a line nobody reads or adds to is kept, said by the device that
 * makes it, since a relay reads nothing on a line to tell. `lasting`: a
 * book's line, an inbox's or a huddle's, kept `LINE_IDLE_DAYS.lasting`
 * and, once let go, made again by its owner alone. `passing`: a line of
 * one day's plays, kept `LINE_IDLE_DAYS.passing` and then forgotten
 * whole, its owner with it, since nobody makes it again. A line made
 * without one is lasting, as every line was before there were two.
 */
export type LineKeep = "lasting" | "passing"

/** How many days a line nobody reads or adds to is kept before a relay lets go of it, by how it is kept. */
export const LINE_IDLE_DAYS: Readonly<Record<LineKeep, number>> = { lasting: 7, passing: 3 }

/**
 * Commits to put on the end of a line, by a device that has every entry up
 * to `after`; and, on the commits that make the line, how long it is kept.
 * A relay that does not know `keep` passes it over, and keeps the line as
 * it keeps any.
 */
export interface AppendDto {
  readonly after: number
  readonly entries: readonly SealedCommitDto[]
  readonly keep?: LineKeep
}

export interface AppendedDto {
  readonly head: number
  readonly begunAt: string
}

/**
 * What a person let into a line may do there: read it and add to it, only
 * read it, or only add to it — a sender puts things on a line it is never
 * shown, and learns nothing of the line but where it ends.
 */
export type GrantRole = "editor" | "viewer" | "sender"

/** One person let into a line, as its relay knows them: by an id its owner gave, never by name. */
export interface GrantDto {
  readonly id: string
  readonly role: GrantRole
  readonly createdAt: string
}

/** A grant to make: its id, the token it answers to — kept only as its hash — and what the token may do. */
export interface NewGrantDto {
  readonly id: string
  readonly token: string
  readonly role: GrantRole
}

export interface GrantsDto {
  readonly grants: readonly GrantDto[]
}

/**
 * Why a relay refused.
 *
 * - `behind`: the line has entries past `after`; they are to be taken first.
 * - `line-missing`: nothing was ever sent to this line, or it was left idle and let go.
 * - `too-many`: the sender has asked, or sent, more than one address may in a while.
 * - `forbidden`: the token is the line's, but not one that may do this — a viewer adding to it, a sender reading it, or anyone but its owner seeing to its grants.
 */
export type RelayError =
  | { readonly type: "unauthorized" }
  | { readonly type: "forbidden" }
  | { readonly type: "line-missing" }
  | { readonly type: "behind"; readonly head: number }
  | { readonly type: "invalid"; readonly field: string }
  | { readonly type: "too-large" }
  | { readonly type: "too-many" }
  | { readonly type: "not-found" }
  | { readonly type: "forbidden-origin" }
  | { readonly type: "storage"; readonly detail: string }

export interface RelayErrorDto {
  readonly error: RelayError
}

/**
 * The most commits one request may put on a line, the longest a sealed
 * commit may be, the most bytes a request's body may be, and the size past
 * which a body is a large one: a play recorded is a kilobyte or so, and only
 * a book's first commits are large. And the most people one line's owner
 * may let into it.
 */
export const RELAY_LIMITS = { entriesPerAppend: 200, boxLength: 2_000_000, bodyBytes: 4_000_000, smallBodyBytes: 32_000, grantsPerLine: 50 } as const
