import type { Result } from "../../core/result/result"
import type { Invitation, InvitedRole } from "../../core/sync/invitation"
import type { LineAccess } from "./relay"

/** Everything a line's secret gives: where the line is and what opens it on a relay, and the key its commits are sealed with. */
export interface LineKeys {
  readonly lineId: string
  readonly token: string
  readonly key: CryptoKey
}

export type SealFailure = { readonly type: "bad-secret" } | { readonly type: "unreadable-box" } | { readonly type: "sealing-unavailable"; readonly detail: string }

/**
 * What keeps a book's commits unreadable anywhere but on its own devices.
 * One secret, made on the device that starts syncing a book and carried to
 * the others in the pairing code, is all a relay never sees.
 */
export interface Sealer {
  /** A fresh secret: 32 random bytes, as base64url. */
  readonly newSecret: () => string
  /** Everything that opens a line, from what a device was given: drawn from the line's secret, or taken as an invitation hands it. */
  readonly keysOf: (secret: string) => Promise<Result<LineKeys, SealFailure>>
  /**
   * Everything that opens a book's inbox, drawn from the book's secret: a
   * line of its own beside the book's, with a key of its own, where those
   * let in to send put plays that only the owner reads.
   */
  readonly inboxKeysOf: (secret: string) => Promise<Result<LineKeys, SealFailure>>
  /**
   * An invitation made from a book's secret: a fresh token for one person,
   * and the id and key of the line they are let into — the book's own for
   * an editor or a viewer, its inbox for a sender, whose invitation also
   * says what the book is called. The token opens nothing until the line's
   * relay is told of it.
   */
  readonly invitationOf: (secret: string, role: InvitedRole, title: string) => Promise<Result<Invitation, SealFailure>>
  /** A commit's change, sealed so that it opens only with the key and only as that commit's. */
  readonly seal: (keys: LineKeys, commitId: string, text: string) => Promise<Result<string, SealFailure>>
  readonly open: (keys: LineKeys, commitId: string, box: string) => Promise<Result<string, SealFailure>>
}

export const accessOf = (relayUrl: string, keys: LineKeys): LineAccess => ({ relayUrl, lineId: keys.lineId, token: keys.token })
