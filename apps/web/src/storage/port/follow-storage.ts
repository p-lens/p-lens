import type { PlayDraft } from "../../core/live-play/draft"
import type { Followed } from "../../core/play-line/following"
import type { PlayId } from "../../core/play/play"
import type { Result } from "../../core/result/result"
import type { DraftError } from "./draft-storage"

/**
 * Where a device keeps its copies of the plays its owner's other devices
 * hold, beside the plays it holds itself. A play is in one or the other,
 * never both: which device holds a play is which store has it, and a play
 * passes from one to the other in one step.
 */
export interface FollowStorage {
  readonly listFollowed: () => Promise<Result<readonly Followed[], DraftError>>
  readonly readFollowed: (id: PlayId) => Promise<Result<Followed | undefined, DraftError>>
  /** Keep a copy as shown, in place of the one kept; none is kept of a play this device holds, which stays as it is. */
  readonly putFollowed: (followed: Followed) => Promise<Result<void, DraftError>>
  readonly dropFollowed: (id: PlayId) => Promise<Result<void, DraftError>>
  /** Hold a play this device kept a copy of: the copy let go and the play kept as its own, all or none. The play as it is now held. */
  readonly takeUp: (followed: Followed) => Promise<Result<PlayDraft, DraftError>>
  /** Give up a play this device held for the copy another device's line has: the play let go and the copy kept, all or none, and neither where its log is no longer `previousLog`. */
  readonly yieldUp: (id: PlayId, followed: Followed, previousLog: string) => Promise<Result<void, DraftError>>
  /** Hold again, at a later handover, a play this device holds and another device claimed: that handover kept on it, all else as it is, and nothing where its log is no longer `previousLog`. */
  readonly claimBack: (id: PlayId, handovers: number, previousLog: string) => Promise<Result<void, DraftError>>
}
