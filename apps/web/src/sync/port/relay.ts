import type { AppendedDto, GrantDto, LineEntriesDto, LineKeep, NewGrantDto, SealedCommitDto } from "@p-lens/contracts/relay"

import type { Result } from "../../core/result/result"

/** How a device reaches one book's line: the relay it is on, the line's id there, and the token that opens it. */
export interface LineAccess {
  readonly relayUrl: string
  readonly lineId: string
  readonly token: string
}

/**
 * Why a relay gave nothing.
 *
 * - `behind`: the line has entries this device has not taken; they come first.
 * - `line-missing`: nothing was ever sent to the line, or the relay let go of it for being left idle.
 * - `too-many`: this address has asked, or sent, more than a relay lets one in a while; a later round goes through.
 * - `shut-out`: the token opens the line no longer, or never did: a grant taken away, or a code that is another line's.
 * - `not-permitted`: the token is the line's, and may not do this: a viewer adding to it, or anyone but its owner seeing to who is let in.
 * - `unreachable`: no answer came: no signal, none in time, or a gateway on the way answering in the relay's place that it could not reach it (502–504, 52x) or that the network wants a login first (511).
 * - `server-trouble`: the relay answered that it failed itself, its storage or otherwise (5xx): a later try goes through.
 * - `too-large`: what was sent is more than a relay takes at once, or a line's grants are as many as it lets in.
 * - `refused`: the relay answered, and said no in a way no retry changes.
 * - `unreadable-answer`: something answered as if it went through and was not the relay: a hall's login page, or an answer cut short.
 */
export type RelayFailure =
  | { readonly type: "unreachable"; readonly detail: string }
  | { readonly type: "behind"; readonly head: number }
  | { readonly type: "line-missing" }
  | { readonly type: "too-many" }
  | { readonly type: "shut-out" }
  | { readonly type: "not-permitted" }
  | { readonly type: "server-trouble"; readonly status: number }
  | { readonly type: "too-large" }
  | { readonly type: "refused"; readonly status: number; readonly reason: string }
  | { readonly type: "unreadable-answer" }

/**
 * A relay: where sealed commits wait for a book's other devices. The local
 * book stays the original either way; a relay only carries copies of its
 * commits, none of which it can read, and keeps a line only while it is
 * used: one let go is made again by the first device to come back. An official relay and a self-hosted
 * one are reached the same way, and nothing outside an adapter names either.
 */
export interface Relay {
  /** A line's entries after a place in it, at most as many as the relay hands over at once. */
  readonly entriesAfter: (access: LineAccess, after: number) => Promise<Result<LineEntriesDto, RelayFailure>>
  /**
   * Put sealed commits on the end of a line that ends at `after`; where it
   * then ends, and when it was begun. `keep` says how long a line these
   * commits make is kept; left out, as long as a book's.
   */
  readonly append: (access: LineAccess, after: number, entries: readonly SealedCommitDto[], keep?: LineKeep) => Promise<Result<AppendedDto, RelayFailure>>
  /** Everyone a line's owner has let into it, as the relay knows them. The owner's alone to ask. */
  readonly grants: (access: LineAccess) => Promise<Result<readonly GrantDto[], RelayFailure>>
  /** Let one more person into a line, or change what one already in may do: the line's grants after it. */
  readonly grant: (access: LineAccess, grant: NewGrantDto) => Promise<Result<readonly GrantDto[], RelayFailure>>
  /** Take a person's grant away: the line's grants after it. */
  readonly revoke: (access: LineAccess, grantId: string) => Promise<Result<readonly GrantDto[], RelayFailure>>
}
