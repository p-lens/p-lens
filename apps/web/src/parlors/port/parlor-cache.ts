import type { ParlorList } from "../../core/parlor/shared"
import type { Result } from "../../core/result/result"

/** Why the list kept on the device could not be read or kept. */
export interface CacheError {
  readonly detail: string
}

/**
 * The parlor list as the device keeps it: the list, the version of the
 * published one it was read from — what the publisher said of its files as
 * it sent them — where it said, and when it was last read from the
 * published one or found the same as it. A copy kept before versions were
 * has none, and is read again whole; one kept before the moment was has no
 * moment.
 */
export interface KeptList {
  readonly list: ParlorList
  readonly version: string | undefined
  readonly readAt: string | undefined
}

/** The parlor list as last read, kept on the device: what is listed at once, and what a reading of the published one is told from. */
export interface ParlorCache {
  readonly read: () => Promise<Result<KeptList, CacheError>>
  readonly replace: (kept: KeptList) => Promise<Result<void, CacheError>>
  /** The copy found the same as the published list at this moment: only the moment is written, never the list again. */
  readonly confirm: (readAt: string) => Promise<Result<void, CacheError>>
}
